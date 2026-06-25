package kobenet

import (
	"crypto/ecdsa"
	"encoding/json"
	"fmt"
	"math/big"
	"os"

	keygen "github.com/bnb-chain/tss-lib/v2/ecdsa/keygen"
	"github.com/bnb-chain/tss-lib/v2/tss"
	ethcrypto "github.com/ethereum/go-ethereum/crypto"
)

// OperatorShare is the on-disk form of ONE operator's key share — the share that
// never leaves the operator's own process/host in the networked design. Unlike
// engine/kobe-ecdsa/persist.go (which writes all N shares to one file for the
// in-process simulation), here each operator writes its own single share, so no
// file ever holds the full set and the separation of operators is real.
type OperatorShare struct {
	Index     int                       `json:"index"`
	Moniker   string                    `json:"moniker"`
	Threshold int                       `json:"threshold"`
	GroupPubX string                    `json:"group_pub_x"`
	GroupPubY string                    `json:"group_pub_y"`
	Save      keygen.LocalPartySaveData `json:"save"`
}

// SaveOperatorShare writes this operator's single share to path (mode 0600).
func SaveOperatorShare(path string, index int, moniker string, threshold int, save *keygen.LocalPartySaveData, groupPub *ecdsa.PublicKey) error {
	doc := OperatorShare{
		Index:     index,
		Moniker:   moniker,
		Threshold: threshold,
		GroupPubX: groupPub.X.String(),
		GroupPubY: groupPub.Y.String(),
		Save:      *save,
	}
	bz, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, bz, 0o600)
}

// LoadOperatorShare reads this operator's single share back, returning the save
// data and the group public key.
func LoadOperatorShare(path string) (*OperatorShare, *ecdsa.PublicKey, error) {
	bz, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, err
	}
	var doc OperatorShare
	if err := json.Unmarshal(bz, &doc); err != nil {
		return nil, nil, err
	}
	x, ok1 := new(big.Int).SetString(doc.GroupPubX, 10)
	y, ok2 := new(big.Int).SetString(doc.GroupPubY, 10)
	if !ok1 || !ok2 {
		return nil, nil, fmt.Errorf("bad group pubkey in share")
	}
	groupPub := &ecdsa.PublicKey{Curve: ethcrypto.S256(), X: x, Y: y}
	return &doc, groupPub, nil
}

// QuorumPartyIDs builds the sorted PartyID ordering for a signing quorum and a
// map from quorum-local index back to the global operator index. The signing
// Network is built keyed by quorum-local index, so routing during signing uses
// these local indices consistently on every operator in the quorum.
func QuorumPartyIDs(peers []Peer, quorum []int) (tss.SortedPartyIDs, []int) {
	unsorted := make(tss.UnSortedPartyIDs, len(quorum))
	byKey := make(map[string]int, len(quorum))
	for i, gi := range quorum {
		pid := PartyIDFor(peers[gi])
		unsorted[i] = pid
		byKey[pid.KeyInt().String()] = gi
	}
	sorted := tss.SortPartyIDs(unsorted)
	globalForLocal := make([]int, len(sorted))
	for li, pid := range sorted {
		globalForLocal[li] = byKey[pid.KeyInt().String()]
	}
	return sorted, globalForLocal
}
