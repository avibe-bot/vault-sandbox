#!/usr/bin/env python3
"""Offline, public-key-only acceptance through actual main.ts RPC and Bitcoin Core.

Requires Core 31.1 binaries and its unchanged functional test framework. No
wallet, network peers, inherited config, live keys, sendrawtransaction or funding
service is used. Mines disposable regtest coinbases only; NEVER fund these keys.
Output must be a new directory. Test ceremonies are simulated, NOT real passkeys.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time

PINS = {
    "messages.py": "c786651a517a49dd084b1d76072f755d40c5483f5be53b7322ca4f3403548b26",
    "script.py": "24bdbfc18cfa1084c1c985218c0067c2e4c06cbd83488e5c08f2167a12bf3abf",
    "key.py": "1f48819cbecacb5916a32a4930b4576ab362c190fa552342378e5c809a6bae77",
    "crypto/secp256k1.py": "cab75b7335f839b88eb8517b417715858e538aaf0071f6c01ec4eb3e1867f246",
    "segwit_addr.py": "fbeb2a01fdae651877262c4902d237dd28d56f0e35b0fc137d3dd97854b18b08",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin-dir", type=Path, required=True)
    parser.add_argument("--framework", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    repo = Path(__file__).resolve().parents[1]
    for name, expected in PINS.items():
        assert sha(args.framework / "test_framework" / name) == expected, name
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(args.framework.resolve()))
    from test_framework import messages as wire, script, segwit_addr

    binaries = {name: (args.bin_dir / name).resolve() for name in ("bitcoind", "bitcoin-cli")}
    version = subprocess.check_output([str(binaries["bitcoind"]), "--version"], text=True).splitlines()[0]
    assert "v31.1.0" in version, version
    public = json.loads((repo / "src/fixtures/vault-protected-bitcoin-core.json").read_text())
    keys = {key["id"]: key for key in public["keys"]}
    receipt = {
        "warning": "PUBLIC scalars 1/2/6/11; disposable offline regtest; simulated authorization, not hardware passkeys.",
        "version": version,
        "coreCommit": "9be056a8a72b624dae9623b2f7bded92c2a21c91",
        "frameworkHashes": PINS,
        "binaryHashes": {name: sha(path) for name, path in binaries.items()},
        "sandboxSourceHashes": {str(path.relative_to(repo)): sha(path) for path in sorted((repo / "src").glob("*.ts"))},
        "scriptSha256": sha(Path(__file__)),
        "ceremony": "Actual main.ts RPC; simulated confirmation click and same-origin UV response; actual policy, release signature, VMK, decryption and signer.",
        "cases": [], "cleanShutdown": False,
    }
    with tempfile.TemporaryDirectory(prefix="isolated-core-", dir=output) as temporary:
        root = Path(temporary)
        home, datadir = root / "home", root / "node"
        home.mkdir()
        datadir.mkdir()
        config = root / "empty.conf"
        config.write_text("")
        env = {key: value for key, value in os.environ.items() if key in ("PATH", "TMPDIR", "SYSTEMROOT")}
        env.update(HOME=str(home), XDG_CONFIG_HOME=str(home / "config"), XDG_DATA_HOME=str(home / "data"),
                   XDG_CACHE_HOME=str(home / "cache"), npm_config_cache=str(home / "npm-cache"))
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        common = ["-regtest", f"-datadir={datadir}", f"-conf={config}", f"-rpcport={port}"]
        command = [str(binaries["bitcoind"]), *common, "-server=1", "-networkactive=0", "-connect=0", "-listen=0",
                   "-dnsseed=0", "-discover=0", "-disablewallet=1", "-rpcbind=127.0.0.1", "-rpcallowip=127.0.0.1",
                   "-printtoconsole=1"]
        receipt["isolationFlags"] = command[len(common) + 1:]

        def rpc(method: str, *params):
            value = subprocess.check_output(
                [str(binaries["bitcoin-cli"]), *common, "-rpcconnect=127.0.0.1", method,
                 *(json.dumps(p, separators=(",", ":")) if isinstance(p, (list, dict)) else str(p) for p in params)],
                env=env, text=True, stderr=subprocess.PIPE, timeout=30,
            )
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value.strip()

        with (output / "node.log").open("w") as log:
            process = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 30
                while True:
                    try:
                        info = rpc("getblockchaininfo")
                        break
                    except subprocess.CalledProcessError:
                        if process.poll() is not None or time.monotonic() > deadline:
                            raise RuntimeError("Isolated Core did not start; inspect node.log")
                        time.sleep(0.1)
                assert info["chain"] == "regtest"
                network = rpc("getnetworkinfo")
                assert network["networkactive"] is False and network["connections"] == 0
                inputs = []
                for vector in public["cases"]:
                    key = keys[vector["signing_key_id"]]
                    address = segwit_addr.encode_segwit_address("bcrt", 1, bytes.fromhex(key["output_xonly_hex"]))
                    blocks = rpc("generatetoaddress", 101, address)
                    parent = rpc("getblock", blocks[0], 2)["tx"][0]
                    prev = next(v for v in parent["vout"] if v["scriptPubKey"]["hex"] == key["script_pubkey_hex"])
                    # Use Core's exact serialized amount, including later regtest halvings.
                    funding = wire.tx_from_hex(parent["hex"])
                    amount = funding.vout[prev["n"]].nValue
                    tx = wire.tx_from_hex(vector["unsigned_tx_hex"])
                    tx.vin[0].prevout = wire.COutPoint(int(parent["txid"], 16), prev["n"])
                    tx.vout[-1].nValue += amount - vector["funding"]["spent_output_value_sats"]

                    def context(value, script_hex):
                        return {"kind": "bitcoin-taproot-keypath-v1", "network": "regtest",
                                "unsignedTransaction": tx.serialize_without_witness().hex(),
                                "prevout": {"amountSats": value, "scriptPubKey": script_hex},
                                "digestAlgorithm": "bip341-sighash-default-keypath",
                                "digest": script.TaprootSignatureHash(tx, [wire.CTxOut(value, bytes.fromhex(script_hex))], 0, input_index=0).hex()}

                    wrong_script = bytearray.fromhex(key["script_pubkey_hex"])
                    wrong_script[-1] ^= 1
                    inputs.append({"id": vector["id"], "publicScalarHex": key["public_secret_scalar_hex"],
                                   "context": context(amount, key["script_pubkey_hex"]),
                                   "falseAmount": context(amount - 1, key["script_pubkey_hex"]),
                                   "falseScript": context(amount, wrong_script.hex())})
                (output / "inputs.json").write_text(json.dumps(inputs, indent=2) + "\n")
                test_env = {**env, "AVIBE_TEST_CORE_INPUT": str(output / "inputs.json"),
                            "AVIBE_TEST_CORE_OUTPUT": str(output / "signatures.json")}
                with (output / "rpc-test.log").open("w") as test_log:
                    subprocess.run(["npm", "test", "--", "--run", "src/signRpc.test.ts"], cwd=repo,
                                   env=test_env, stdout=test_log, stderr=subprocess.STDOUT, check=True, timeout=90)
                signatures = json.loads((output / "signatures.json").read_text())
                for item, signed in zip(inputs, signatures, strict=True):
                    assert item["id"] == signed["id"]
                    case = {"id": item["id"], "context": item["context"], "checks": {}}
                    for name, field in (("rpc-positive", "rpc"), ("false-amount-rpc", "falseAmountRpc"),
                                        ("false-script-primitive", "falseScriptPrimitive"), ("raw-p-primitive", "rawPrimitive"),
                                        ("post-sign-output-tamper", "rpc")):
                        tx = wire.tx_from_hex(item["context"]["unsignedTransaction"])
                        signature = bytes.fromhex(signed[field]["signature"])
                        assert len(signature) == 64
                        tx.wit.vtxinwit = [wire.CTxInWitness()]
                        tx.wit.vtxinwit[0].scriptWitness.stack = [signature]
                        if name == "post-sign-output-tamper":
                            tx.vout[-1].nValue -= 1
                        raw = tx.serialize_with_witness().hex()
                        result = rpc("testmempoolaccept", [raw])[0]
                        assert result["allowed"] is (name == "rpc-positive"), (name, result)
                        if name != "rpc-positive":
                            assert "signature" in result.get("reject-reason", "").lower(), (name, result)
                        case["checks"][name] = {"rawTransaction": raw, "result": result}
                    receipt["cases"].append(case)
                assert rpc("getmempoolinfo")["size"] == 0
                receipt["mempoolSize"] = 0
            finally:
                if process.poll() is None:
                    try:
                        rpc("stop")
                        process.wait(timeout=15)
                    except (subprocess.SubprocessError, OSError):
                        process.terminate()  # Only the exact process this script started.
                        process.wait(timeout=15)
                receipt["cleanShutdown"] = process.returncode == 0
                (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    assert receipt["cleanShutdown"]
    print(f"PASS: {len(receipt['cases'])} actual RPC transactions, 16 Core rejection checks; no broadcasts; clean shutdown")
    print(output / "receipt.json")


if __name__ == "__main__":
    main()
