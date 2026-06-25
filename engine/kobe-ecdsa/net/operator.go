package kobenet

import (
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"os"

	"github.com/bnb-chain/tss-lib/v2/tss"
)

// OperatorConfig is the on-disk identity + topology for one operator process.
// Each operator gets its OWN config file (distinct index, distinct identity key,
// distinct listen port, distinct share path) — that is what makes the three
// processes genuinely separate operators rather than three views of one secret.
//
// The identity private key authenticates this operator on the wire; the peer
// directory pins every other operator's identity PUBLIC key so an impostor that
// doesn't hold the matching private key is rejected at the handshake.
type OperatorConfig struct {
	Index       int    `json:"index"`
	Moniker     string `json:"moniker"`
	Listen      string `json:"listen"`       // host:port this operator listens on
	IdentityHex string `json:"identity_key"` // hex ed25519 private key (64 bytes)
	SharePath   string `json:"share_path"`   // path to THIS operator's single key share
	Peers       []Peer `json:"peers"`        // every operator incl. self (pubkeys only)
}

// LoadOperatorConfig reads and validates an operator config, decoding the
// identity private key and every peer's pinned public key from hex.
func LoadOperatorConfig(path string) (*OperatorConfig, ed25519.PrivateKey, []Peer, error) {
	bz, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("read config: %w", err)
	}
	var c OperatorConfig
	if err := json.Unmarshal(bz, &c); err != nil {
		return nil, nil, nil, fmt.Errorf("parse config: %w", err)
	}
	privBz, err := hex.DecodeString(c.IdentityHex)
	if err != nil || len(privBz) != ed25519.PrivateKeySize {
		return nil, nil, nil, fmt.Errorf("bad identity key (want %d hex bytes)", ed25519.PrivateKeySize)
	}
	priv := ed25519.PrivateKey(privBz)
	peers := make([]Peer, len(c.Peers))
	for i, p := range c.Peers {
		pub, err := hex.DecodeString(p.PubHex)
		if err != nil || len(pub) != ed25519.PublicKeySize {
			return nil, nil, nil, fmt.Errorf("peer %d: bad pubkey", p.Index)
		}
		p.PubKey = ed25519.PublicKey(pub)
		peers[i] = p
	}
	return &c, priv, peers, nil
}

// PartyIDFor builds the tss.PartyID for a peer index using a deterministic share
// key derived from the moniker order. For keygen the key just needs to be unique
// and stable; tss-lib sorts by it. We use (index+1) as the big-int key so the
// sort order matches the configured index order across all processes.
func PartyIDFor(p Peer) *tss.PartyID {
	return tss.NewPartyID(fmt.Sprintf("op-%d", p.Index), p.Moniker, big.NewInt(int64(p.Index+1)))
}

// AllPartyIDs builds the full sorted party ordering from the peer directory.
// Every operator process builds the identical ordering (same inputs), so the
// indices line up across processes.
func AllPartyIDs(peers []Peer) tss.SortedPartyIDs {
	unsorted := make(tss.UnSortedPartyIDs, len(peers))
	for i, p := range peers {
		unsorted[i] = PartyIDFor(p)
	}
	return tss.SortPartyIDs(unsorted)
}
