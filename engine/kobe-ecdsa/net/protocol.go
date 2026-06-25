package kobenet

import (
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"time"

	"github.com/bnb-chain/tss-lib/v2/common"
	keygen "github.com/bnb-chain/tss-lib/v2/ecdsa/keygen"
	signing "github.com/bnb-chain/tss-lib/v2/ecdsa/signing"
	"github.com/bnb-chain/tss-lib/v2/tss"
	ethcrypto "github.com/ethereum/go-ethereum/crypto"
)

// This file is the bridge between tss-lib and the wire. The in-process signer
// (engine/kobe-ecdsa/tss.go) ran ALL N parties as goroutines and routed their
// tss.Message output through in-memory channels. Here each OPERATOR PROCESS runs
// exactly ONE party; its outgoing tss.Message is serialized with WireBytes() and
// pushed onto the Network (broadcast or point-to-point per IsBroadcast/GetTo),
// and inbound authenticated Envelopes are fed back into the party with Update().
//
// The routing logic (broadcast = all-but-sender, p2p = GetTo indices) is exactly
// tss-lib's own contract — the same logic the in-process route()/routeSign()
// used, but the hop is now a real socket instead of a channel.

// RunKeygen runs this operator's keygen party to completion over the network.
// pids is the full sorted party ordering (all operators); selfIdx is this
// operator's index. It returns this operator's share (its own LocalPartySaveData)
// and the group public key. The share never leaves this process.
func RunKeygen(net *Network, pids tss.SortedPartyIDs, selfIdx, threshold int, preParams *keygen.LocalPreParams, timeout time.Duration) (*keygen.LocalPartySaveData, *ecdsa.PublicKey, error) {
	ctx := tss.NewPeerContext(pids)
	params := tss.NewParameters(tss.S256(), ctx, pids[selfIdx], len(pids), threshold)

	outCh := make(chan tss.Message, len(pids)*8)
	endCh := make(chan *keygen.LocalPartySaveData, 1)
	partyErr := make(chan *tss.Error, 1)

	party := keygen.NewLocalParty(params, outCh, endCh, *preParams).(*keygen.LocalParty)
	go func() {
		if err := party.Start(); err != nil {
			partyErr <- err
		}
	}()

	for {
		select {
		case msg := <-outCh:
			if err := dispatch(net, msg); err != nil {
				return nil, nil, fmt.Errorf("operator %d: dispatch: %w", selfIdx, err)
			}
		case e := <-net.Inbox():
			if err := feed(party, pids, e, selfIdx); err != nil {
				return nil, nil, err
			}
		case terr := <-net.Errs():
			return nil, nil, fmt.Errorf("transport aborted: %w", terr)
		case perr := <-partyErr:
			return nil, nil, fmt.Errorf("operator %d: party error: %w", selfIdx, perr.Cause())
		case sd := <-endCh:
			// We finished. Run the FIN barrier so no operator tears down the mesh
			// while a peer still needs its final broadcast.
			net.Fin(30 * time.Second)
			groupPub := &ecdsa.PublicKey{Curve: ethcrypto.S256(), X: sd.ECDSAPub.X(), Y: sd.ECDSAPub.Y()}
			return sd, groupPub, nil
		case <-time.After(timeout):
			return nil, nil, fmt.Errorf("operator %d: keygen timed out after %s", selfIdx, timeout)
		}
	}
}

// RunSign runs this operator's signing party to completion over the network.
// signPIDs is the sorted ordering of the SIGNING quorum (not all operators);
// selfIdx is this operator's position within that quorum. save is this
// operator's own key share. It returns the group SignatureData (r, s, recovery).
func RunSign(net *Network, signPIDs tss.SortedPartyIDs, selfIdx, threshold int, save keygen.LocalPartySaveData, hash32 []byte, timeout time.Duration) (*common.SignatureData, error) {
	ctx := tss.NewPeerContext(signPIDs)
	params := tss.NewParameters(tss.S256(), ctx, signPIDs[selfIdx], len(signPIDs), threshold)
	msg := new(big.Int).SetBytes(hash32)

	outCh := make(chan tss.Message, len(signPIDs)*8)
	endCh := make(chan *common.SignatureData, 1)
	partyErr := make(chan *tss.Error, 1)

	party := signing.NewLocalParty(msg, params, save, outCh, endCh).(*signing.LocalParty)
	go func() {
		if err := party.Start(); err != nil {
			partyErr <- err
		}
	}()

	for {
		select {
		case msg := <-outCh:
			if err := dispatch(net, msg); err != nil {
				return nil, fmt.Errorf("operator %d: dispatch: %w", selfIdx, err)
			}
		case e := <-net.Inbox():
			if err := feed(party, signPIDs, e, selfIdx); err != nil {
				return nil, err
			}
		case terr := <-net.Errs():
			return nil, fmt.Errorf("transport aborted: %w", terr)
		case perr := <-partyErr:
			return nil, fmt.Errorf("operator %d: party error: %w", selfIdx, perr.Cause())
		case sd := <-endCh:
			net.Fin(30 * time.Second)
			return sd, nil
		case <-time.After(timeout):
			return nil, fmt.Errorf("operator %d: signing timed out after %s", selfIdx, timeout)
		}
	}
}

// feed parses an authenticated inbound Envelope into a tss.Message and applies
// it to the party. A parse error (malformed protocol bytes that nonetheless
// passed the wire auth) or a protocol-level Update error aborts the run.
func feed(party tss.Party, pids tss.SortedPartyIDs, e *Envelope, selfIdx int) error {
	var from *tss.PartyID
	for _, p := range pids {
		if p.Index == e.From {
			from = p
			break
		}
	}
	if from == nil {
		return fmt.Errorf("operator %d: message from unknown party index %d", selfIdx, e.From)
	}
	pmsg, err := tss.ParseWireMessage(e.Payload, from, e.IsBroadcast)
	if err != nil {
		return fmt.Errorf("operator %d: parse wire message from %d: %w", selfIdx, e.From, err)
	}
	if _, perr := party.Update(pmsg); perr != nil {
		return fmt.Errorf("operator %d: protocol update from %d: %w", selfIdx, e.From, perr.Cause())
	}
	return nil
}

// dispatch routes one outgoing tss.Message over the network using tss-lib's own
// routing contract: GetTo()==nil is a broadcast (every other participant), else
// it is point-to-point to each listed recipient index.
func dispatch(net *Network, msg tss.Message) error {
	bz, _, err := msg.WireBytes()
	if err != nil {
		return fmt.Errorf("wire bytes: %w", err)
	}
	to := msg.GetTo()
	if to == nil { // broadcast
		return net.Broadcast(bz)
	}
	for _, dest := range to {
		if err := net.SendTo(dest.Index, bz); err != nil {
			return err
		}
	}
	return nil
}
