#!/usr/bin/env python3
"""
Encrypt (or re-key) the report dataset.

The app ships only ciphertext. The access password is never stored in the bundle:
it is stretched with PBKDF2-SHA256 (310,000 iterations, per-build random salt) and
the resulting key decrypts the payload with AES-256-GCM. A wrong password fails the
GCM authentication tag, which is the whole login check — there is no separate hash
to compare and nothing readable without the password.

    File layout:  salt[16] | iv[12] | ciphertext+tag

Usage
    python3 etl/encrypt_dataset.py                 # generate a new password
    python3 etl/encrypt_dataset.py "my-password"   # use a specific one

Reads  public/dataset.bin   (gzipped cube, produced by pack_dataset.py)
Writes public/dataset.enc   (what the app loads)

Rotating the password only needs a re-run and a redeploy. Anyone holding the old
password keeps whatever copy of the old bundle they already downloaded, so treat
rotation as "new people cannot get in", not "old people are locked out".
"""
import math
import os
import secrets
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITERATIONS = 310_000
# Unambiguous alphabet: no 0/O/1/I/l, so the password survives being read aloud
# or retyped from a message without support calls.
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
ROOT = Path(__file__).resolve().parent.parent


def new_password(groups: int = 4, size: int = 5) -> str:
    return "-".join("".join(secrets.choice(ALPHABET) for _ in range(size)) for _ in range(groups))


def main() -> None:
    password = sys.argv[1] if len(sys.argv) > 1 else new_password()

    plaintext = (ROOT / "public" / "dataset.bin").read_bytes()
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(
        algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS
    ).derive(password.encode())
    blob = salt + iv + AESGCM(key).encrypt(iv, plaintext, None)
    (ROOT / "public" / "dataset.enc").write_bytes(blob)

    bits = len(password.replace("-", "")) * math.log2(len(ALPHABET))
    print(f"password   {password}")
    print(f"entropy    ~{bits:.0f} bits")
    print(f"written    public/dataset.enc  ({len(blob):,} bytes)")
    print("\nShare the password out of band. It is not recoverable from the bundle.")


if __name__ == "__main__":
    main()
