// gen-operators writes N operator config files for a networked Distin GG20
// signing set. Each config gets its OWN fresh Ed25519 identity key and its own
// listen port and share path; every config carries the shared peer directory
// (all operators' identity PUBLIC keys + addresses) so the operators can pin and
// authenticate each other on the wire.
//
//	gen-operators -n 3 -base-port 9100 -dir ./operators
//
// This is a setup helper, not part of the protocol: it just mints distinct
// identities so the three operator processes are genuinely independent parties.
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
)

type peer struct {
	Index   int    `json:"index"`
	Addr    string `json:"addr"`
	PubHex  string `json:"pubkey"`
	Moniker string `json:"moniker"`
}

type operatorConfig struct {
	Index       int    `json:"index"`
	Moniker     string `json:"moniker"`
	Listen      string `json:"listen"`
	IdentityHex string `json:"identity_key"`
	SharePath   string `json:"share_path"`
	Peers       []peer `json:"peers"`
}

func main() {
	n := flag.Int("n", 3, "number of operators")
	basePort := flag.Int("base-port", 9100, "first listen port (operator i uses base+i)")
	dir := flag.String("dir", "./operators", "output directory for configs + shares")
	host := flag.String("host", "127.0.0.1", "listen host (localhost only)")
	flag.Parse()

	if err := os.MkdirAll(*dir, 0o755); err != nil {
		log.Fatalf("mkdir: %v", err)
	}

	privs := make([]ed25519.PrivateKey, *n)
	peers := make([]peer, *n)
	monikers := []string{"alice", "bob", "carol", "dave", "erin", "frank"}
	for i := 0; i < *n; i++ {
		pub, priv, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			log.Fatalf("keygen identity %d: %v", i, err)
		}
		privs[i] = priv
		m := fmt.Sprintf("op%d", i)
		if i < len(monikers) {
			m = monikers[i]
		}
		peers[i] = peer{
			Index:   i,
			Addr:    fmt.Sprintf("%s:%d", *host, *basePort+i),
			PubHex:  hex.EncodeToString(pub),
			Moniker: m,
		}
	}

	for i := 0; i < *n; i++ {
		cfg := operatorConfig{
			Index:       i,
			Moniker:     peers[i].Moniker,
			Listen:      peers[i].Addr,
			IdentityHex: hex.EncodeToString(privs[i]),
			SharePath:   filepath.Join(*dir, fmt.Sprintf("op%d.share.json", i)),
			Peers:       peers,
		}
		bz, _ := json.MarshalIndent(cfg, "", "  ")
		path := filepath.Join(*dir, fmt.Sprintf("op%d.json", i))
		if err := os.WriteFile(path, bz, 0o600); err != nil {
			log.Fatalf("write %s: %v", path, err)
		}
		fmt.Printf("wrote %s  (%s, identity_pub %s…, listen %s)\n",
			path, peers[i].Moniker, peers[i].PubHex[:12], peers[i].Addr)
	}
}
