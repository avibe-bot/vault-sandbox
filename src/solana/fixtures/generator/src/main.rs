//! Public Solana message vectors for `src/solana/`, produced by the upstream Rust
//! crates. Nothing here runs the parser under test: bytes come from the upstream
//! serializers, expectations from the upstream decoder, sanitizer and the
//! arguments given to the upstream instruction builders.
//!
//!   cargo run --locked            > ../upstream-rust-vectors.json
//!   cargo run --locked -- verdict < lines of "<message hex> <public key hex>"
//!
//! Offline after the crates are fetched. No key material: signer addresses are
//! the RFC 8032 section 7.1 test public keys, every other address is a byte pattern.

use {
    bincode::Options,
    serde_json::{json, Value},
    solana_address::Address,
    solana_hash::Hash,
    solana_instruction::{AccountMeta, Instruction},
    solana_message::{
        compiled_instruction::CompiledInstruction,
        legacy,
        v0::{self, LoadedAddresses, MessageAddressTableLookup},
        AccountKeys, AddressLookupTableAccount, VersionedMessage,
    },
    solana_pubkey_v3::Pubkey as TokenPubkey,
    solana_short_vec::ShortU16,
    solana_signature::Signature,
    solana_transaction::versioned::VersionedTransaction,
    std::{collections::BTreeSet, io::BufRead},
};

const PACKET_DATA_SIZE: usize = 1232;

/// RFC 8032 section 7.1 TEST 1, 2 and 3 public keys.
const RFC8032_1: &str = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const RFC8032_2: &str = "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c";
const RFC8032_3: &str = "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025";

/// `test_sdk_serialize` in solana-sdk `transaction/src/lib.rs`, copied by script.
const SDK_SERIALIZE_TRANSACTION: &[u8] = include!("sdk_serialize.in");

fn key(hex_key: &str) -> Address {
    Address::from(<[u8; 32]>::try_from(hex::decode(hex_key).unwrap()).unwrap())
}

fn pattern(byte: u8) -> Address {
    Address::from([byte; 32])
}

fn token_key(address: &Address) -> TokenPubkey {
    TokenPubkey::new_from_array(address.to_bytes())
}

/// Builder crates pin different majors of the instruction types; the fields are the same.
macro_rules! instruction {
    ($built:expr) => {{
        let built = $built;
        Instruction {
            program_id: Address::from(built.program_id.to_bytes()),
            accounts: built
                .accounts
                .iter()
                .map(|meta| AccountMeta {
                    pubkey: Address::from(meta.pubkey.to_bytes()),
                    is_signer: meta.is_signer,
                    is_writable: meta.is_writable,
                })
                .collect(),
            data: built.data.clone(),
        }
    }};
}

/// The decoder a validator applies to packet bytes (`Packet::deserialize_slice`).
fn decode(bytes: &[u8]) -> Option<VersionedMessage> {
    bincode::options()
        .with_limit(PACKET_DATA_SIZE as u64)
        .with_fixint_encoding()
        .reject_trailing_bytes()
        .deserialize(bytes)
        .ok()
}

fn upstream_verdict(bytes: &[u8]) -> Value {
    match decode(bytes) {
        Some(message) => json!({
            "decode": "ok",
            "sanitize": if message.sanitize().is_ok() { "ok" } else { "error" },
        }),
        None => json!({ "decode": "error", "sanitize": null }),
    }
}

/// Both upstream serializers must agree on the bytes.
fn serialize(message: &VersionedMessage) -> Vec<u8> {
    let bytes = bincode::serialize(message).unwrap();
    assert_eq!(bytes, message.serialize(), "bincode and wincode serializers disagree");
    bytes
}

fn transaction_length(message: &VersionedMessage) -> usize {
    let signatures = vec![Signature::default(); usize::from(message.header().num_required_signatures)];
    bincode::serialize(&VersionedTransaction { signatures, message: message.clone() }).unwrap().len()
}

fn load(message: &VersionedMessage, tables: &[AddressLookupTableAccount]) -> LoadedAddresses {
    let Some(lookups) = message.address_table_lookups() else { return LoadedAddresses::default() };
    lookups
        .iter()
        .map(|lookup| {
            let table = tables.iter().find(|table| table.key == lookup.account_key).expect("table");
            let pick = |indexes: &[u8]| indexes.iter().map(|&index| table.addresses[usize::from(index)]).collect();
            LoadedAddresses { writable: pick(&lookup.writable_indexes), readonly: pick(&lookup.readonly_indexes) }
        })
        .collect()
}

/// Structural facts of `bytes` as the upstream decoder sees them, in the parser's fact shape.
fn structure(bytes: &[u8], tables: &[AddressLookupTableAccount]) -> Value {
    let message = decode(bytes).expect("upstream decodes the vector");
    let version = match &message {
        VersionedMessage::Legacy(_) => "legacy",
        VersionedMessage::V0(_) => "v0",
        _ => panic!("unexpected message version"),
    };
    let header = message.header();
    let static_keys = message.static_account_keys();
    let static_account = |index: usize| {
        json!({
            "index": index,
            "address": static_keys[index].to_string(),
            "signer": message.is_signer(index),
            "writable": message.is_maybe_writable_with_reserved_addresses(index, None::<&BTreeSet<Address>>),
        })
    };
    let lookups: &[MessageAddressTableLookup] = message.address_table_lookups().unwrap_or(&[]);
    let loaded = load(&message, tables);
    let account_keys = AccountKeys::new(static_keys, Some(&loaded));
    let account_ref = |index: usize| {
        if index < static_keys.len() {
            let mut account = static_account(index);
            account["source"] = json!("static");
            return account;
        }
        // Identify the loaded account by address, then find where its table holds it.
        let address = account_keys.get(index).expect("upstream resolves the account index");
        let writable = loaded.writable.contains(address);
        let (lookup_index, table_index) = lookups
            .iter()
            .enumerate()
            .find_map(|(lookup_index, lookup)| {
                let table = tables.iter().find(|table| table.key == lookup.account_key)?;
                let position = table.addresses.iter().position(|entry| entry == address)?;
                Some((lookup_index, position))
            })
            .expect("a referenced table holds the address");
        json!({
            "source": "lookup",
            "index": index,
            "lookupIndex": lookup_index,
            "accountKey": lookups[lookup_index].account_key.to_string(),
            "tableIndex": table_index,
            "writable": writable,
        })
    };
    let instructions: Vec<Value> = message
        .instructions()
        .iter()
        .enumerate()
        .map(|(index, instruction)| {
            json!({
                "index": index,
                "programIdIndex": instruction.program_id_index,
                "programId": static_keys[usize::from(instruction.program_id_index)].to_string(),
                "accounts": instruction.accounts.iter().map(|&account| account_ref(usize::from(account))).collect::<Vec<_>>(),
                "dataHex": hex::encode(&instruction.data),
            })
        })
        .collect();
    json!({
        "version": version,
        "messageHex": hex::encode(bytes),
        "messageLength": bytes.len(),
        "transactionLength": transaction_length(&message),
        "header": {
            "numRequiredSignatures": header.num_required_signatures,
            "numReadonlySignedAccounts": header.num_readonly_signed_accounts,
            "numReadonlyUnsignedAccounts": header.num_readonly_unsigned_accounts,
        },
        "feePayer": static_keys[0].to_string(),
        "staticAccountKeys": (0..static_keys.len()).map(static_account).collect::<Vec<_>>(),
        "recentBlockhash": message.recent_blockhash().to_string(),
        "instructions": instructions,
        "addressTableLookups": lookups.iter().map(|lookup| json!({
            "accountKey": lookup.account_key.to_string(),
            "writableIndexes": lookup.writable_indexes,
            "readonlyIndexes": lookup.readonly_indexes,
        })).collect::<Vec<_>>(),
    })
}

fn undecoded(reason: &str) -> Value {
    json!({ "decoded": null, "undecodedReason": reason })
}

fn decoded(transfer: Value) -> Value {
    json!({ "decoded": transfer, "undecodedReason": null })
}

/// An accepted vector: upstream structure plus the meaning stated by construction.
fn accepted(
    id: &str,
    note: &str,
    bytes: &[u8],
    expected_key: &Address,
    tables: &[AddressLookupTableAccount],
    meanings: Vec<Value>,
) -> Value {
    let verdict = upstream_verdict(bytes);
    assert_eq!(verdict, json!({ "decode": "ok", "sanitize": "ok" }), "{id}");
    let mut facts = structure(bytes, tables);
    let message = decode(bytes).unwrap();
    let signers = &message.static_account_keys()[..usize::from(message.header().num_required_signatures)];
    let signer_index = signers.iter().position(|signer| signer == expected_key).expect("expected key signs");
    facts["expectedSigner"] = json!({
        "index": signer_index,
        "address": expected_key.to_string(),
        "isFeePayer": signer_index == 0,
    });
    let instructions = facts["instructions"].as_array_mut().unwrap();
    assert_eq!(instructions.len(), meanings.len(), "{id}");
    let mut any_undecoded = !message.address_table_lookups().unwrap_or(&[]).is_empty();
    for (instruction, meaning) in instructions.iter_mut().zip(meanings) {
        any_undecoded |= meaning["decoded"].is_null();
        instruction["decoded"] = meaning["decoded"].clone();
        instruction["undecodedReason"] = meaning["undecodedReason"].clone();
    }
    facts["hasUndecodedContent"] = json!(any_undecoded);
    json!({
        "id": id,
        "note": note,
        "expectedPublicKeyHex": hex::encode(expected_key.to_bytes()),
        "upstream": verdict,
        "facts": facts,
    })
}

fn rejected(id: &str, note: &str, bytes: &[u8], expected_key: &Address, code: &str) -> Value {
    let mut vector = json!({
        "id": id,
        "note": note,
        "messageHex": hex::encode(bytes),
        "expectedPublicKeyHex": hex::encode(expected_key.to_bytes()),
        "upstream": upstream_verdict(bytes),
        "code": code,
    });
    if let Some(message) = decode(bytes) {
        vector["upstream"]["transactionLength"] = json!(transaction_length(&message));
    }
    vector
}

fn compact_u16_vectors() -> Value {
    // solana-sdk short-vec/src/lib.rs: test_short_vec_encode_len and test_deserialize.
    let valid: &[(u16, &[u8])] = &[
        (0x0000, &[0x00]),
        (0x007f, &[0x7f]),
        (0x0080, &[0x80, 0x01]),
        (0x00ff, &[0xff, 0x01]),
        (0x0100, &[0x80, 0x02]),
        (0x07ff, &[0xff, 0x0f]),
        (0x3fff, &[0xff, 0x7f]),
        (0x4000, &[0x80, 0x80, 0x01]),
        (0x7fff, &[0xff, 0xff, 0x01]),
        (0xffff, &[0xff, 0xff, 0x03]),
    ];
    let invalid: &[(&str, &[u8])] = &[
        ("invalid_compact_u16", &[0x80, 0x00]),
        ("invalid_compact_u16", &[0x80, 0x80, 0x00]),
        ("invalid_compact_u16", &[0xff, 0x00]),
        ("invalid_compact_u16", &[0xff, 0x80, 0x00]),
        ("invalid_compact_u16", &[0x80, 0x81, 0x00]),
        ("invalid_compact_u16", &[0xff, 0x81, 0x00]),
        ("invalid_compact_u16", &[0x80, 0x82, 0x00]),
        ("invalid_compact_u16", &[0xff, 0x8f, 0x00]),
        ("invalid_compact_u16", &[0xff, 0xff, 0x00]),
        ("truncated", &[]),
        ("truncated", &[0x80]),
        ("invalid_compact_u16", &[0x80, 0x80, 0x80, 0x00]),
        ("invalid_compact_u16", &[0x80, 0x80, 0x04]),
        ("invalid_compact_u16", &[0x80, 0x80, 0x06]),
    ];
    for (value, bytes) in valid {
        assert_eq!(bincode::deserialize::<ShortU16>(bytes).unwrap().0, *value);
        assert_eq!(bincode::serialize(&ShortU16(*value)).unwrap(), *bytes);
    }
    for (_, bytes) in invalid {
        assert!(bincode::deserialize::<ShortU16>(bytes).is_err());
    }
    json!({
        "valid": valid.iter().map(|(value, bytes)| json!({ "hex": hex::encode(bytes), "value": value })).collect::<Vec<_>>(),
        "invalid": invalid.iter().map(|(code, bytes)| json!({ "hex": hex::encode(bytes), "code": code })).collect::<Vec<_>>(),
    })
}

fn vectors() -> Value {
    let signer_a = key(RFC8032_1);
    let signer_b = key(RFC8032_2);
    let signer_c = key(RFC8032_3);
    let recipient = pattern(0x52);
    let token_source = pattern(0x61);
    let token_destination = pattern(0x62);
    let mint = pattern(0x6d);
    let delegate = pattern(0x64);
    let multisig = pattern(0x6a);
    let nonce_account = pattern(0x6e);
    let unknown_program = pattern(0x99);
    let blockhash = Hash::new_from_array([0xbb; 32]);
    let token_program = spl_token_interface::ID;
    let token = |address: &Address| token_key(address);

    let mut accepted_vectors = Vec::new();
    let mut rejected_vectors = Vec::new();

    // Upstream's own published transaction bytes: one signature, then the message.
    let sdk_transaction: VersionedTransaction = bincode::options()
        .with_limit(PACKET_DATA_SIZE as u64)
        .with_fixint_encoding()
        .reject_trailing_bytes()
        .deserialize(SDK_SERIALIZE_TRANSACTION)
        .unwrap();
    let sdk_message = &SDK_SERIALIZE_TRANSACTION[1 + 64..];
    assert_eq!(serialize(&sdk_transaction.message), sdk_message);
    assert_eq!(transaction_length(&sdk_transaction.message), SDK_SERIALIZE_TRANSACTION.len());
    accepted_vectors.push(accepted(
        "upstream-test-sdk-serialize",
        "Message of the transaction bytes asserted by solana-sdk test_sdk_serialize. Unknown program, raw.",
        sdk_message,
        &sdk_transaction.message.static_account_keys()[0],
        &[],
        vec![undecoded("unsupported_program")],
    ));

    // 1. Native transfer, the signer pays the fee.
    let system_transfer = legacy::Message::new_with_blockhash(
        &[instruction!(solana_system_interface::instruction::transfer(&signer_a, &recipient, 1_000_000_007))],
        Some(&signer_a),
        &blockhash,
    );
    let system_transfer_bytes = serialize(&VersionedMessage::Legacy(system_transfer.clone()));
    accepted_vectors.push(accepted(
        "legacy-system-transfer",
        "solana_system_interface::instruction::transfer(A, recipient, 1000000007).",
        &system_transfer_bytes,
        &signer_a,
        &[],
        vec![decoded(json!({
            "kind": "system-transfer",
            "source": signer_a.to_string(),
            "destination": recipient.to_string(),
            "lamports": "1000000007",
        }))],
    ));

    // 2. SPL Transfer of u64::MAX; another key pays the fee, the expected key is a read-only signer.
    let spl_transfer = legacy::Message::new_with_blockhash(
        &[instruction!(spl_token_interface::instruction::transfer(
            &token_program,
            &token(&token_source),
            &token(&token_destination),
            &token(&signer_a),
            &[],
            u64::MAX,
        )
        .unwrap())],
        Some(&signer_b),
        &blockhash,
    );
    accepted_vectors.push(accepted(
        "legacy-spl-transfer-other-fee-payer",
        "spl_token_interface transfer(source, destination, authority = A, u64::MAX); B pays the fee.",
        &serialize(&VersionedMessage::Legacy(spl_transfer)),
        &signer_a,
        &[],
        vec![decoded(json!({
            "kind": "spl-transfer",
            "sourceTokenAccount": token_source.to_string(),
            "destinationTokenAccount": token_destination.to_string(),
            "authority": signer_a.to_string(),
            "amount": "18446744073709551615",
        }))],
    ));

    // 3. SPL TransferChecked in a v0 message without lookups.
    let transfer_checked = instruction!(spl_token_interface::instruction::transfer_checked(
        &token_program,
        &token(&token_source),
        &token(&mint),
        &token(&token_destination),
        &token(&signer_a),
        &[],
        1_234_567,
        6,
    )
    .unwrap());
    let v0_static = v0::Message::try_compile(&signer_a, &[transfer_checked.clone()], &[], blockhash.clone()).unwrap();
    let transfer_checked_meaning = decoded(json!({
        "kind": "spl-transfer-checked",
        "sourceTokenAccount": token_source.to_string(),
        "mint": mint.to_string(),
        "destinationTokenAccount": token_destination.to_string(),
        "authority": signer_a.to_string(),
        "amount": "1234567",
        "decimals": 6,
    }));
    accepted_vectors.push(accepted(
        "v0-spl-transfer-checked-static",
        "spl_token_interface transfer_checked(source, mint, destination, authority = A, 1234567, 6); v0, no lookups.",
        &serialize(&VersionedMessage::V0(v0_static.clone())),
        &signer_a,
        &[],
        vec![transfer_checked_meaning.clone()],
    ));

    // 3b. The same message plus a lookup that no instruction references.
    let mut v0_unused_lookup = v0_static;
    v0_unused_lookup.address_table_lookups.push(MessageAddressTableLookup {
        account_key: pattern(0x71),
        writable_indexes: vec![0],
        readonly_indexes: vec![],
    });
    accepted_vectors.push(accepted(
        "v0-decoded-transfer-unused-lookup",
        "The TransferChecked message with one address table lookup that no instruction uses.",
        &serialize(&VersionedMessage::V0(v0_unused_lookup)),
        &signer_a,
        &[AddressLookupTableAccount { key: pattern(0x71), addresses: vec![pattern(0xa0)] }],
        vec![transfer_checked_meaning],
    ));

    // 4. v0 with two lookup tables. Account order must be static, then writable
    //    entries of table 1 and 2, then read-only entries of table 1 and 2.
    let table_one = AddressLookupTableAccount {
        key: pattern(0x71),
        addresses: (0..5).map(|slot| pattern(0xa0 + slot)).collect(),
    };
    let table_two = AddressLookupTableAccount {
        key: pattern(0x72),
        addresses: (0..3).map(|slot| pattern(0xb0 + slot)).collect(),
    };
    let tables = [table_one.clone(), table_two.clone()];
    let static_readonly = pattern(0x53);
    let lookup_instructions = [
        instruction!(solana_system_interface::instruction::transfer(&signer_a, &table_one.addresses[1], 5)),
        Instruction::new_with_bytes(
            unknown_program,
            &[0xde, 0xad, 0xbe, 0xef],
            vec![
                AccountMeta::new(signer_a, true),
                AccountMeta::new(table_two.addresses[2], false),
                AccountMeta::new_readonly(table_one.addresses[4], false),
                AccountMeta::new_readonly(table_two.addresses[0], false),
                AccountMeta::new(table_one.addresses[3], false),
                AccountMeta::new_readonly(static_readonly, true),
            ],
        ),
    ];
    let v0_lookups = v0::Message::try_compile(&signer_a, &lookup_instructions, &tables, blockhash.clone()).unwrap();
    assert_eq!(v0_lookups.address_table_lookups.len(), 2);
    let v0_lookups_bytes = serialize(&VersionedMessage::V0(v0_lookups.clone()));
    accepted_vectors.push(accepted(
        "v0-two-lookup-tables",
        "System transfer to an address held only by lookup table 1, and an unknown program using both tables.",
        &v0_lookups_bytes,
        &signer_a,
        &tables,
        vec![undecoded("unresolved_account"), undecoded("unsupported_program")],
    ));

    // 5. Instructions that share a transfer's shape or program but are not plain transfers.
    let other_instructions = legacy::Message::new_with_blockhash(
        &[
            instruction!(spl_token_interface::instruction::approve(
                &token_program, &token(&token_source), &token(&delegate), &token(&signer_a), &[], 9,
            ).unwrap()),
            instruction!(spl_token_interface::instruction::approve_checked(
                &token_program, &token(&token_source), &token(&mint), &token(&delegate), &token(&signer_a), &[], 9, 6,
            ).unwrap()),
            instruction!(spl_token_interface::instruction::transfer(
                &token_program, &token(&token_source), &token(&token_destination), &token(&multisig),
                &[&token(&signer_b), &token(&signer_c)], 9,
            ).unwrap()),
            instruction!(solana_system_interface::instruction::advance_nonce_account(&nonce_account, &signer_a)),
            Instruction::new_with_bytes(unknown_program, &[], vec![]),
        ],
        Some(&signer_a),
        &blockhash,
    );
    accepted_vectors.push(accepted(
        "legacy-not-plain-transfers",
        "SPL Approve, ApproveChecked, multisig Transfer; System AdvanceNonceAccount; an unknown program with no data.",
        &serialize(&VersionedMessage::Legacy(other_instructions)),
        &signer_c,
        &[],
        vec![
            undecoded("unsupported_instruction"),
            undecoded("unsupported_instruction"),
            undecoded("unsupported_instruction"),
            undecoded("unsupported_instruction"),
            undecoded("unsupported_program"),
        ],
    ));

    // 5b. Transfer discriminators whose data length or account count is not the plain layout.
    //     The on-chain programs would still run the first three as transfers.
    let system_program = solana_system_interface::program::ID;
    let token_program_address = Address::from(token_program.to_bytes());
    let system_transfer_data = [2, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0];
    let token_transfer_data = [3, 7, 0, 0, 0, 0, 0, 0, 0];
    let near_misses = legacy::Message::new_with_blockhash(
        &[
            Instruction::new_with_bytes(
                system_program,
                &[&system_transfer_data[..], &[0xff]].concat(),
                vec![AccountMeta::new(signer_a, true), AccountMeta::new(recipient, false)],
            ),
            Instruction::new_with_bytes(
                system_program,
                &system_transfer_data,
                vec![AccountMeta::new(signer_a, true), AccountMeta::new(recipient, false), AccountMeta::new_readonly(delegate, false)],
            ),
            Instruction::new_with_bytes(
                token_program_address,
                &[&token_transfer_data[..], &[6]].concat(),
                vec![AccountMeta::new(token_source, false), AccountMeta::new(token_destination, false), AccountMeta::new_readonly(signer_a, true)],
            ),
            Instruction::new_with_bytes(
                token_program_address,
                &[12, 7, 0, 0, 0, 0, 0, 0, 0],
                vec![
                    AccountMeta::new(token_source, false),
                    AccountMeta::new_readonly(mint, false),
                    AccountMeta::new(token_destination, false),
                    AccountMeta::new_readonly(signer_a, true),
                ],
            ),
            Instruction::new_with_bytes(
                token_program_address,
                &token_transfer_data,
                vec![AccountMeta::new(token_source, false), AccountMeta::new(token_destination, false)],
            ),
            Instruction::new_with_bytes(system_program, &[], vec![]),
        ],
        Some(&signer_a),
        &blockhash,
    );
    accepted_vectors.push(accepted(
        "legacy-transfer-near-misses",
        "System Transfer with a trailing byte, with a third account; SPL Transfer with a trailing byte; TransferChecked without decimals; SPL Transfer without authority; System with no data.",
        &serialize(&VersionedMessage::Legacy(near_misses)),
        &signer_a,
        &[],
        vec![undecoded("unsupported_instruction"); 6],
    ));

    // 6. The expected key fills two required-signer slots. Upstream sanitize accepts it.
    let repeated_signer = legacy::Message::new_with_compiled_instructions(
        2,
        0,
        1,
        vec![signer_a, signer_a, unknown_program],
        blockhash.clone(),
        vec![CompiledInstruction::new_from_raw_parts(2, vec![0x01], vec![0, 1])],
    );
    accepted_vectors.push(accepted(
        "legacy-repeated-signer-key",
        "Key A is both required signers. Structurally valid upstream; the first slot is reported.",
        &serialize(&VersionedMessage::Legacy(repeated_signer)),
        &signer_a,
        &[],
        vec![undecoded("unsupported_program")],
    ));

    // 7 and 8. A signed transaction of exactly 1232 bytes, and one byte more.
    let sized = |data_length: usize| {
        VersionedMessage::Legacy(legacy::Message::new_with_blockhash(
            &[Instruction::new_with_bytes(unknown_program, &vec![0x5a; data_length], vec![])],
            Some(&signer_a),
            &blockhash,
        ))
    };
    let largest = sized(1062);
    assert_eq!(transaction_length(&largest), PACKET_DATA_SIZE);
    accepted_vectors.push(accepted(
        "legacy-packet-1232",
        "Largest signed transaction: 1232 bytes. Instruction data length uses a two-byte compact-u16.",
        &serialize(&largest),
        &signer_a,
        &[],
        vec![undecoded("unsupported_program")],
    ));
    let too_large = sized(1063);
    assert_eq!(transaction_length(&too_large), PACKET_DATA_SIZE + 1);
    rejected_vectors.push(rejected(
        "legacy-packet-1233",
        "One byte over the packet limit once signed. The message alone decodes and sanitizes.",
        &serialize(&too_large),
        &signer_a,
        "packet_too_large",
    ));

    // Byte mutations of upstream bytes.
    let mut alias = system_transfer_bytes.clone();
    assert_eq!(alias[3], 3);
    alias.splice(3..4, [0x83, 0x00]);
    rejected_vectors.push(rejected("legacy-account-count-alias", "Account count 3 written as the two-byte alias 83 00.", &alias, &signer_a, "invalid_compact_u16"));
    let mut trailing = system_transfer_bytes.clone();
    trailing.push(0);
    rejected_vectors.push(rejected("legacy-trailing-byte", "One zero byte after the last instruction.", &trailing, &signer_a, "trailing_bytes"));
    let truncated = &system_transfer_bytes[..system_transfer_bytes.len() - 1];
    rejected_vectors.push(rejected("legacy-truncated", "Last instruction data byte removed.", truncated, &signer_a, "truncated"));
    let mut trailing_v0 = v0_lookups_bytes.clone();
    trailing_v0.push(0);
    rejected_vectors.push(rejected("v0-trailing-byte", "One zero byte after the last address table lookup.", &trailing_v0, &signer_a, "trailing_bytes"));
    for (id, prefix) in [("version-1-prefix", 0x81u8), ("version-127-prefix", 0xff)] {
        let mut versioned = v0_lookups_bytes.clone();
        versioned[0] = prefix;
        rejected_vectors.push(rejected(id, "The v0 message with another version prefix byte.", &versioned, &signer_a, "unsupported_version"));
    }

    // Unsanitary messages, serialized by upstream as they are.
    let legacy_case = |edit: &dyn Fn(&mut legacy::Message)| {
        let mut message = system_transfer.clone();
        edit(&mut message);
        serialize(&VersionedMessage::Legacy(message))
    };
    rejected_vectors.push(rejected(
        "legacy-no-writable-fee-payer",
        "Every required signer is read-only.",
        &legacy_case(&|message| message.header.num_readonly_signed_accounts = 1),
        &signer_a,
        "invalid_header",
    ));
    rejected_vectors.push(rejected(
        "legacy-header-exceeds-keys",
        "Signed plus read-only unsigned accounts exceed the account keys.",
        &legacy_case(&|message| message.header.num_readonly_unsigned_accounts = 3),
        &signer_a,
        "invalid_header",
    ));
    rejected_vectors.push(rejected(
        "legacy-program-is-fee-payer",
        "Program id index 0.",
        &legacy_case(&|message| message.instructions[0].program_id_index = 0),
        &signer_a,
        "invalid_program_id_index",
    ));
    rejected_vectors.push(rejected(
        "legacy-program-index-out-of-range",
        "Program id index equals the account key count.",
        &legacy_case(&|message| message.instructions[0].program_id_index = 3),
        &signer_a,
        "invalid_program_id_index",
    ));
    rejected_vectors.push(rejected(
        "legacy-account-index-out-of-range",
        "Instruction account index equals the account key count.",
        &legacy_case(&|message| message.instructions[0].accounts[1] = 3),
        &signer_a,
        "invalid_account_index",
    ));
    let static_count = v0_lookups.account_keys.len() as u8;
    let loaded_count = v0_lookups
        .address_table_lookups
        .iter()
        .map(|lookup| lookup.writable_indexes.len() + lookup.readonly_indexes.len())
        .sum::<usize>() as u8;
    let v0_case = |edit: &dyn Fn(&mut v0::Message)| {
        let mut message = v0_lookups.clone();
        edit(&mut message);
        serialize(&VersionedMessage::V0(message))
    };
    rejected_vectors.push(rejected(
        "v0-program-id-loaded",
        "Program id index names the first lookup-loaded account.",
        &v0_case(&|message| message.instructions[1].program_id_index = static_count),
        &signer_a,
        "invalid_program_id_index",
    ));
    rejected_vectors.push(rejected(
        "v0-account-index-out-of-range",
        "Instruction account index equals static plus loaded accounts.",
        &v0_case(&|message| message.instructions[1].accounts[0] = static_count + loaded_count),
        &signer_a,
        "invalid_account_index",
    ));
    rejected_vectors.push(rejected(
        "v0-lookup-loads-nothing",
        "A third address table lookup with no indexes.",
        &v0_case(&|message| {
            message.address_table_lookups.push(MessageAddressTableLookup {
                account_key: pattern(0x73),
                writable_indexes: vec![],
                readonly_indexes: vec![],
            })
        }),
        &signer_a,
        "invalid_address_table_lookup",
    ));
    rejected_vectors.push(rejected(
        "v0-257-accounts",
        "Static plus loaded accounts total 257.",
        &v0_case(&|message| {
            message.address_table_lookups.push(MessageAddressTableLookup {
                account_key: pattern(0x73),
                writable_indexes: vec![0; 257 - usize::from(static_count) - usize::from(loaded_count)],
                readonly_indexes: vec![],
            })
        }),
        &signer_a,
        "invalid_address_table_lookup",
    ));

    // Valid messages that the expected key is not required to sign.
    rejected_vectors.push(rejected(
        "signer-only-a-recipient",
        "The expected key is in the message, but not among the required signers.",
        &system_transfer_bytes,
        &recipient,
        "signer_not_required",
    ));
    rejected_vectors.push(rejected(
        "signer-absent",
        "The expected key is not in the message.",
        &system_transfer_bytes,
        &signer_b,
        "signer_not_required",
    ));

    json!({
        "schema": 1,
        "notice": "Public offline test vectors. No private key, funded account, RPC or chain state.",
        "compactU16": compact_u16_vectors(),
        "accepted": accepted_vectors,
        "rejected": rejected_vectors,
    })
}

/// Differential mode: the upstream verdict and structure for arbitrary bytes.
/// Lookup tables are synthetic: distinct addresses per table slot, so a loaded
/// account can be traced back to the slot that upstream resolved it from.
fn verdict_lines() {
    for line in std::io::stdin().lock().lines() {
        let line = line.unwrap();
        let mut parts = line.split_whitespace();
        // "-" stands for the empty message.
        let bytes = hex::decode(parts.next().unwrap().trim_start_matches('-')).unwrap();
        let expected = hex::decode(parts.next().unwrap()).unwrap();
        let Some(message) = decode(&bytes) else {
            println!("{}", json!({ "decode": false }));
            continue;
        };
        let supported = matches!(message, VersionedMessage::Legacy(_) | VersionedMessage::V0(_));
        let sanitize = message.sanitize().is_ok();
        let static_keys = message.static_account_keys();
        let signers = usize::from(message.header().num_required_signatures).min(static_keys.len());
        let signer_index = static_keys[..signers].iter().position(|signer| signer.to_bytes()[..] == expected[..]);
        let lookups = message.address_table_lookups().unwrap_or(&[]);
        let tables: Vec<AddressLookupTableAccount> = lookups
            .iter()
            .enumerate()
            .map(|(table, lookup)| AddressLookupTableAccount {
                key: lookup.account_key,
                addresses: (0..=255u8)
                    .map(|slot| {
                        let mut address = [0xee; 32];
                        address[1] = table as u8;
                        address[2] = (table >> 8) as u8;
                        address[3] = slot;
                        Address::from(address)
                    })
                    .collect(),
            })
            .collect();
        // Tracing by address needs each table key and each slot to be used once.
        let mut table_keys = BTreeSet::new();
        let mut slots = BTreeSet::new();
        let traceable = lookups.iter().enumerate().all(|(table, lookup)| {
            table_keys.insert(lookup.account_key)
                && lookup.writable_indexes.iter().chain(&lookup.readonly_indexes).all(|&slot| slots.insert((table, slot)))
        });
        println!("{}", json!({
            "decode": true,
            "supported": supported,
            "sanitize": sanitize,
            "transactionLength": transaction_length(&message),
            "signerIndex": signer_index,
            "structure": if supported && sanitize && traceable { structure(&bytes, &tables) } else { Value::Null },
        }));
    }
}

fn main() {
    if std::env::args().nth(1).as_deref() == Some("verdict") {
        verdict_lines();
    } else {
        println!("{}", serde_json::to_string_pretty(&vectors()).unwrap());
    }
}
