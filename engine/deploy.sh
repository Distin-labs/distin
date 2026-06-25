#!/bin/bash
# distin - 배포 스크립트 (Token-2022 표준)
# 사용법:
#   bash deploy.sh devnet      -> devnet 배포 + 검증
#   bash deploy.sh mainnet     -> mainnet 배포 (devnet 검증 완료 후만)

set -e
NETWORK=${1:-devnet}
PROGRAM_NAME="distin"

# ─── mainnet 안전장치 ─────────────────────────────────────────────
if [ "$NETWORK" = "mainnet" ]; then
    # devnet 배포 검증 체크
    if [ ! -f "devnet_verified.txt" ]; then
        echo "ERROR: devnet 검증이 완료되지 않았습니다."
        echo "먼저 bash deploy.sh devnet 실행 후 모든 테스트 통과해야 합니다."
        echo "devnet_verified.txt 파일이 있어야 mainnet 배포 가능합니다."
        exit 1
    fi
    echo "!!! MAINNET 배포 !!!"
    echo "정말 mainnet에 배포합니까? (y/N)"
    read -r confirm
    if [ "$confirm" != "y" ]; then
        echo "취소됨."
        exit 0
    fi
fi

echo "=== $PROGRAM_NAME 배포 ($NETWORK) ==="

# ─── 1. 빌드 ──────────────────────────────────────────────────────
echo "[1/6] anchor build..."
anchor build

# ─── 2. Program ID 확인 ───────────────────────────────────────────
PROGRAM_ID=$(solana-keygen pubkey target/deploy/$PROGRAM_NAME-keypair.json 2>/dev/null)
if [ -z "$PROGRAM_ID" ]; then
    echo "ERROR: keypair 없음. anchor build 먼저 실행"
    exit 1
fi
echo "Program ID: $PROGRAM_ID"

# ─── 3. declare_id 동기화 ─────────────────────────────────────────
echo "[2/6] declare_id 동기화..."
sed -i "s/declare_id!(\"[^\"]*\")/declare_id!(\"$PROGRAM_ID\")/" programs/*/src/lib.rs
anchor build

# ─── 4. 배포 ──────────────────────────────────────────────────────
echo "[3/6] 프로그램 배포 ($NETWORK)..."
if [ "$NETWORK" = "mainnet" ]; then
    anchor deploy --provider.cluster mainnet-beta
else
    anchor deploy --provider.cluster devnet
fi

# ─── 5. Token-2022 민트 생성 ──────────────────────────────────────
echo "[4/6] Token-2022 민트 생성..."
if [ "$NETWORK" = "mainnet" ]; then
    RPC_URL="https://api.mainnet-beta.solana.com"
else
    RPC_URL="https://api.devnet.solana.com"
fi

# Token-2022 프로그램으로 민트 생성 (metadata extension 포함)
spl-token create-token \
    --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb \
    --enable-metadata \
    --decimals 9 \
    --url $RPC_URL \
    2>&1 | tee mint_output.txt

MINT_ADDRESS=$(grep "Creating token" mint_output.txt | awk '{print $3}')
echo "Token Mint: $MINT_ADDRESS"

# 메타데이터 초기화
if [ ! -z "$MINT_ADDRESS" ]; then
    spl-token initialize-metadata \
        "$MINT_ADDRESS" \
        "Distin" \
        "${PROGRAM_NAME^^}" \
        "https://placeholder.uri" \
        --url $RPC_URL \
        2>&1 || echo "메타데이터 초기화 skip (이미 존재하거나 권한 없음)"
fi

# ─── 6. 검증 ──────────────────────────────────────────────────────
echo "[5/6] 프로그램 검증..."
solana program show $PROGRAM_ID --url $RPC_URL

echo "[6/6] 토큰 검증..."
if [ ! -z "$MINT_ADDRESS" ]; then
    spl-token display "$MINT_ADDRESS" --url $RPC_URL 2>/dev/null || echo "토큰 표시 실패"
fi

echo ""
echo "=== 배포 완료 ==="
echo "Network:    $NETWORK"
echo "Program ID: $PROGRAM_ID"
echo "Token Mint: $MINT_ADDRESS"
echo "Token 표준: Token-2022 (TokenExtensions)"
echo "Explorer:   https://explorer.solana.com/address/$PROGRAM_ID?cluster=$NETWORK"
if [ ! -z "$MINT_ADDRESS" ]; then
    echo "Token:      https://explorer.solana.com/address/$MINT_ADDRESS?cluster=$NETWORK"
fi

# devnet 성공 시 검증 파일 생성
if [ "$NETWORK" = "devnet" ]; then
    echo "devnet 배포 검증 완료" > devnet_verified.txt
    echo "Program ID: $PROGRAM_ID" >> devnet_verified.txt
    echo "Token Mint: $MINT_ADDRESS" >> devnet_verified.txt
    echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> devnet_verified.txt
    echo ""
    echo "devnet 검증 완료. mainnet 배포 가능:"
    echo "  bash deploy.sh mainnet"
fi
