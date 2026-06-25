// operator is one Distin GG20 signing operator, run as its OWN OS process.
//
// Milestone 6: where the in-process signer ran all 3 parties as goroutines in a
// single process sharing in-memory channels, this binary is launched 3 times —
// 3 distinct PIDs, 3 distinct listen ports, 3 distinct identity keys, and (after
// keygen) 3 distinct share files, each operator holding ONLY its own share. The
// operators run the GG20 DKG and a 2-of-3 threshold sign over real TCP sockets,
// authenticating every wire message with their Ed25519 identity keys.
//
// Two phases:
//
//	operator -config op0.json -phase keygen -threshold 1
//	    Joins the mesh, runs distributed key generation, writes ONLY this
//	    operator's share to its share_path, prints {index, group_eth_address}.
//
//	operator -config op0.json -phase sign -quorum 0,2 -hash <64hex>
//	    If this operator is in -quorum, joins the quorum mesh, loads its own
//	    share, runs the GG20 signing rounds over the network, and (the operator
//	    that finishes) prints {r, s, v, sig65, group_eth_address,
//	    recovered_eth_address, match}. Operators not in the quorum exit 0 idle.
//
// All protocol messages cross the wire; the share never leaves this process.
package main

import (
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	keygen "github.com/bnb-chain/tss-lib/v2/ecdsa/keygen"
	kobe "github.com/distin/kobe-ecdsa"
	kobenet "github.com/distin/kobe-ecdsa/net"
)

func main() {
	configPath := flag.String("config", "", "operator config JSON (identity + peer directory)")
	phase := flag.String("phase", "", "keygen | sign")
	threshold := flag.Int("threshold", 1, "tss-lib threshold t (t+1 sign); 2-of-3 = 1")
	quorum := flag.String("quorum", "", "sign: comma-separated GLOBAL operator indices in the quorum, e.g. 0,2")
	hashHex := flag.String("hash", "", "sign: 32-byte message hash, hex")
	timeout := flag.Duration("timeout", 5*time.Minute, "overall phase timeout")
	flag.Parse()

	if *configPath == "" || *phase == "" {
		log.Fatal("operator: -config and -phase are required")
	}
	cfg, priv, peers, err := kobenet.LoadOperatorConfig(*configPath)
	if err != nil {
		log.Fatalf("operator: load config: %v", err)
	}

	// Every line is prefixed so a tail of all 3 processes shows who did what.
	logf := func(format string, a ...any) {
		fmt.Fprintf(os.Stderr, "[op%d pid=%d port=%s] "+format+"\n",
			append([]any{cfg.Index, os.Getpid(), portOf(cfg.Listen)}, a...)...)
	}
	logf("starting, phase=%s, identity_pub=%s…", *phase, pubShort(priv))

	switch *phase {
	case "keygen":
		runKeygen(cfg, priv, peers, *threshold, *timeout, logf)
	case "sign":
		runSign(cfg, priv, peers, *quorum, *hashHex, *threshold, *timeout, logf)
	default:
		log.Fatalf("operator: unknown phase %q", *phase)
	}
}

func runKeygen(cfg *kobenet.OperatorConfig, priv ed25519.PrivateKey, peers []kobenet.Peer, threshold int, timeout time.Duration, logf func(string, ...any)) {
	pids := kobenet.AllPartyIDs(peers)
	selfIdx := cfg.Index

	// Pre-params (Paillier safe primes) are the slow part of GG20 keygen and are
	// generated LOCALLY by each operator — they are part of this operator's own
	// secret material and never leave the process.
	logf("generating Paillier safe primes (this is the slow part of GG20 DKG)…")
	pre, err := keygen.GeneratePreParams(2 * time.Minute)
	if err != nil {
		log.Fatalf("operator %d: pre-params: %v", selfIdx, err)
	}

	net := kobenet.NewNetwork(selfIdx, cfg.Moniker, priv, peers, "distin-keygen", logf)
	logf("dialing/accepting the %d-operator mesh on the wire…", len(peers))
	if err := net.Start(cfg.Listen, timeout); err != nil {
		log.Fatalf("operator %d: mesh start: %v", selfIdx, err)
	}
	defer net.Close()
	logf("mesh up; running distributed key generation over TCP…")

	save, groupPub, err := kobenet.RunKeygen(net, pids, selfIdx, threshold, pre, timeout)
	if err != nil {
		log.Fatalf("operator %d: keygen: %v", selfIdx, err)
	}

	if err := kobenet.SaveOperatorShare(cfg.SharePath, selfIdx, cfg.Moniker, threshold, save, groupPub); err != nil {
		log.Fatalf("operator %d: save share: %v", selfIdx, err)
	}
	logf("DKG complete; wrote OUR share only to %s", cfg.SharePath)

	emit(map[string]any{
		"index":             selfIdx,
		"phase":             "keygen",
		"share_path":        cfg.SharePath,
		"group_eth_address": kobe.GroupAddress(groupPub).Hex(),
	})
}

func runSign(cfg *kobenet.OperatorConfig, priv ed25519.PrivateKey, peers []kobenet.Peer, quorumStr, hashHex string, threshold int, timeout time.Duration, logf func(string, ...any)) {
	quorum := parseQuorum(quorumStr, len(peers))
	selfGlobal := cfg.Index

	// Operators outside the quorum stay offline for this signature.
	localIdx := indexInQuorum(quorum, selfGlobal)
	if localIdx < 0 {
		logf("not in quorum %v; staying offline for this signature", quorum)
		emit(map[string]any{"index": selfGlobal, "phase": "sign", "participated": false})
		return
	}

	hash, err := hex.DecodeString(strings.TrimPrefix(hashHex, "0x"))
	if err != nil || len(hash) != 32 {
		log.Fatalf("operator %d: -hash must be 32 bytes hex", selfGlobal)
	}

	share, groupPub, err := kobenet.LoadOperatorShare(cfg.SharePath)
	if err != nil {
		log.Fatalf("operator %d: load OUR share: %v", selfGlobal, err)
	}
	logf("loaded OUR share from %s (group addr %s); joining %d-of quorum %v",
		cfg.SharePath, kobe.GroupAddress(groupPub).Hex(), len(quorum), quorum)

	// The signing mesh contains only the quorum operators, re-indexed to their
	// quorum-LOCAL positions so tss-lib's signing routing (0..k-1) and the
	// transport peer indices line up. We build a peer slice keyed by local index.
	signSortedPIDs, globalForLocal := kobenet.QuorumPartyIDs(peers, quorum)
	localPeers := make([]kobenet.Peer, len(signSortedPIDs))
	var selfLocal int
	for li := range signSortedPIDs {
		gi := globalForLocal[li]
		p := peers[gi]
		p.Index = li // re-index to quorum-local
		localPeers[li] = p
		if gi == selfGlobal {
			selfLocal = li
		}
	}

	signThreshold := len(quorum) - 1 // t+1 = quorum size

	net := kobenet.NewNetwork(selfLocal, cfg.Moniker, priv, localPeers, "distin-sign", logf)
	logf("dialing/accepting the quorum mesh (local idx %d of %d)…", selfLocal, len(quorum))
	if err := net.Start(cfg.Listen, timeout); err != nil {
		log.Fatalf("operator %d: quorum mesh start: %v", selfGlobal, err)
	}
	defer net.Close()
	logf("quorum mesh up; running GG20 threshold signing over TCP…")

	sigData, err := kobenet.RunSign(net, signSortedPIDs, selfLocal, signThreshold, share.Save, hash, timeout)
	if err != nil {
		log.Fatalf("operator %d: signing: %v", selfGlobal, err)
	}

	// Assemble the standard (r,s,v) and INDEPENDENTLY verify via go-ethereum
	// ecrecover that it recovers the group address — the exact ETH-node primitive.
	sig := &kobe.EthSignature{V: sigData.SignatureRecovery[0]}
	copy(sig.R[:], leftPad32(sigData.R))
	copy(sig.S[:], leftPad32(sigData.S))

	groupAddr := kobe.GroupAddress(groupPub)
	recovered, err := kobe.RecoverAddress(hash, sig)
	if err != nil {
		log.Fatalf("operator %d: ecrecover: %v", selfGlobal, err)
	}
	logf("signing complete; sig recovers to %s (group %s) match=%v",
		recovered.Hex(), groupAddr.Hex(), recovered == groupAddr)

	emit(map[string]any{
		"index":                 selfGlobal,
		"phase":                 "sign",
		"participated":          true,
		"quorum":                quorum,
		"r":                     hex.EncodeToString(sig.R[:]),
		"s":                     hex.EncodeToString(sig.S[:]),
		"v":                     sig.V,
		"sig65":                 hex.EncodeToString(sig.Bytes()),
		"group_eth_address":     groupAddr.Hex(),
		"recovered_eth_address": recovered.Hex(),
		"match":                 recovered == groupAddr,
	})
}

// --- small helpers ---

func emit(v any) {
	bz, _ := json.Marshal(v)
	fmt.Println(string(bz)) // result goes to STDOUT; logs go to STDERR
}

func parseQuorum(s string, n int) []int {
	if s == "" {
		log.Fatal("sign: -quorum is required")
	}
	var out []int
	for _, part := range strings.Split(s, ",") {
		i, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil || i < 0 || i >= n {
			log.Fatalf("sign: bad quorum index %q", part)
		}
		out = append(out, i)
	}
	return out
}

func indexInQuorum(quorum []int, global int) int {
	for i, g := range quorum {
		if g == global {
			return i
		}
	}
	return -1
}

func portOf(addr string) string {
	if i := strings.LastIndex(addr, ":"); i >= 0 {
		return addr[i+1:]
	}
	return addr
}

func pubShort(priv ed25519.PrivateKey) string {
	pk := priv[32:] // ed25519 private key = seed||pub
	return hex.EncodeToString(pk)[:12]
}

func leftPad32(b []byte) []byte {
	if len(b) >= 32 {
		return b[len(b)-32:]
	}
	out := make([]byte, 32)
	copy(out[32-len(b):], b)
	return out
}
