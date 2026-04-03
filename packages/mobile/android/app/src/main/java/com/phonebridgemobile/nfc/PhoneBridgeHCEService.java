package com.phonebridgemobile.nfc;

import android.nfc.cardemulation.HostApduService;
import android.os.Bundle;
import android.util.Log;

import java.util.Arrays;

/**
 * PhoneBridgeHCEService
 *
 * Emulates an NFC Forum Type 4 Tag using Host Card Emulation (HCE).
 * Handles the following APDU command sequence:
 *   1. SELECT APPLICATION (AID: D2760000850101)
 *   2. SELECT CC FILE (EF: E103)
 *   3. READ BINARY of CC file
 *   4. SELECT NDEF FILE (EF: E104)
 *   5. READ BINARY of NDEF file
 *
 * The NDEF payload is provided via {@link #currentNdefBytes}, which is set by
 * {@link PhoneBridgeHCEModule} when emulation is started.
 */
public class PhoneBridgeHCEService extends HostApduService {

    private static final String TAG = "PhoneBridgeHCE";

    // -----------------------------------------------------------------------
    // AID and File IDs
    // -----------------------------------------------------------------------

    /** NFC Forum Type 4 Tag Application AID */
    private static final byte[] AID_NFC_T4T = hexToBytes("D2760000850101");

    /** Capability Container file ID */
    private static final byte[] FID_CC = {(byte) 0xE1, (byte) 0x03};

    /** NDEF file ID */
    private static final byte[] FID_NDEF = {(byte) 0xE1, (byte) 0x04};

    // -----------------------------------------------------------------------
    // Standard APDU responses
    // -----------------------------------------------------------------------

    private static final byte[] SW_OK              = {(byte) 0x90, (byte) 0x00};
    private static final byte[] SW_FILE_NOT_FOUND  = {(byte) 0x6A, (byte) 0x82};
    private static final byte[] SW_WRONG_P1P2      = {(byte) 0x6B, (byte) 0x00};
    private static final byte[] SW_UNKNOWN         = {(byte) 0x6F, (byte) 0x00};
    private static final byte[] SW_INS_NOT_FOUND   = {(byte) 0x6D, (byte) 0x00};

    // -----------------------------------------------------------------------
    // Capability Container (CC file) — 15 bytes (0x000F)
    //
    //   Offset  Len  Value    Meaning
    //   00      2    000F     CC file length (15 bytes)
    //   02      1    20       Mapping version 2.0
    //   03      2    7FFF     Maximum Le (read)
    //   05      2    7FFF     Maximum Lc (write)
    //   07      8    (TLV)    NDEF File Control TLV
    //               04       T = NDEF File Control
    //               06       L = 6 bytes
    //               E104     NDEF File ID
    //               0000     NDEF File size (filled at runtime via NLEN)
    //               00       Read access: open
    //               00       Write access: open
    // -----------------------------------------------------------------------

    private static final byte[] CC_FILE = hexToBytes("000F207FFF7FFF0406E1040000");

    // -----------------------------------------------------------------------
    // Default NDEF payload: an empty NDEF Text record ("" in English)
    // Encoded as a minimal well-known Text record with SR flag set.
    //   MB=1, ME=1, SR=1, TNF=0x01 (Well Known)
    //   Type Length = 1  ('T')
    //   Payload Length = 3  (lang len byte + "en" + "")
    //   Payload = 0x02 'e' 'n'
    // -----------------------------------------------------------------------

    public static byte[] currentNdefBytes = buildDefaultNdef();

    // -----------------------------------------------------------------------
    // State machine
    // -----------------------------------------------------------------------

    private static final int STATE_NONE      = 0;
    private static final int STATE_AID_SEL   = 1;
    private static final int STATE_CC_SEL    = 2;
    private static final int STATE_NDEF_SEL  = 3;

    private int currentState = STATE_NONE;

    // -----------------------------------------------------------------------
    // HostApduService overrides
    // -----------------------------------------------------------------------

    @Override
    public byte[] processCommandApdu(byte[] apdu, Bundle extras) {
        if (apdu == null || apdu.length < 4) {
            Log.d(TAG, "Received null or too-short APDU");
            return SW_UNKNOWN;
        }

        logApdu("<<<", apdu);

        byte cla = apdu[0];
        byte ins = apdu[1];
        byte p1  = apdu[2];
        byte p2  = apdu[3];

        byte[] response;

        if (ins == (byte) 0xA4) {
            // SELECT
            response = handleSelect(apdu, p1, p2);
        } else if (ins == (byte) 0xB0) {
            // READ BINARY
            response = handleReadBinary(apdu, p1, p2);
        } else {
            Log.d(TAG, "Unknown INS: " + String.format("%02X", ins));
            response = SW_INS_NOT_FOUND;
        }

        logApdu(">>>", response);
        return response;
    }

    @Override
    public void onDeactivated(int reason) {
        Log.d(TAG, "HCE deactivated, reason=" + reason);
        currentState = STATE_NONE;
    }

    // -----------------------------------------------------------------------
    // APDU handlers
    // -----------------------------------------------------------------------

    /**
     * Handles SELECT (INS = 0xA4) commands.
     * Supports:
     *   P1=0x04 — SELECT BY AID (application selection)
     *   P1=0x00 — SELECT BY FILE ID (CC or NDEF file)
     */
    private byte[] handleSelect(byte[] apdu, byte p1, byte p2) {
        if (p1 == (byte) 0x04) {
            // SELECT APPLICATION by AID
            return handleSelectApplication(apdu);
        } else if (p1 == (byte) 0x00 || p1 == (byte) 0x02) {
            // SELECT FILE by File ID
            return handleSelectFile(apdu);
        } else {
            Log.d(TAG, "SELECT: unsupported P1=" + String.format("%02X", p1));
            return SW_WRONG_P1P2;
        }
    }

    private byte[] handleSelectApplication(byte[] apdu) {
        if (apdu.length < 5) {
            return SW_UNKNOWN;
        }
        int lc = apdu[4] & 0xFF;
        if (apdu.length < 5 + lc) {
            return SW_UNKNOWN;
        }
        byte[] aid = Arrays.copyOfRange(apdu, 5, 5 + lc);
        if (Arrays.equals(aid, AID_NFC_T4T)) {
            Log.d(TAG, "SELECT APPLICATION: NFC T4T AID matched");
            currentState = STATE_AID_SEL;
            return SW_OK;
        }
        Log.d(TAG, "SELECT APPLICATION: AID not found: " + bytesToHex(aid));
        return SW_FILE_NOT_FOUND;
    }

    private byte[] handleSelectFile(byte[] apdu) {
        if (currentState == STATE_NONE) {
            Log.d(TAG, "SELECT FILE: application not selected");
            return SW_FILE_NOT_FOUND;
        }
        if (apdu.length < 7) {
            return SW_UNKNOWN;
        }
        int lc = apdu[4] & 0xFF;
        if (lc < 2 || apdu.length < 5 + lc) {
            return SW_UNKNOWN;
        }
        byte[] fid = Arrays.copyOfRange(apdu, 5, 5 + 2);

        if (Arrays.equals(fid, FID_CC)) {
            Log.d(TAG, "SELECT FILE: CC file selected");
            currentState = STATE_CC_SEL;
            return SW_OK;
        } else if (Arrays.equals(fid, FID_NDEF)) {
            Log.d(TAG, "SELECT FILE: NDEF file selected");
            currentState = STATE_NDEF_SEL;
            return SW_OK;
        } else {
            Log.d(TAG, "SELECT FILE: file not found: " + bytesToHex(fid));
            return SW_FILE_NOT_FOUND;
        }
    }

    /**
     * Handles READ BINARY (INS = 0xB0).
     * P1 (high byte of offset) and P2 (low byte of offset) define the read start.
     * The Le byte (last byte of APDU) specifies how many bytes to return.
     */
    private byte[] handleReadBinary(byte[] apdu, byte p1, byte p2) {
        if (currentState == STATE_CC_SEL) {
            return handleReadBinaryCC(apdu, p1, p2);
        } else if (currentState == STATE_NDEF_SEL) {
            return handleReadBinaryNdef(apdu, p1, p2);
        } else {
            Log.d(TAG, "READ BINARY: no file selected");
            return SW_FILE_NOT_FOUND;
        }
    }

    private byte[] handleReadBinaryCC(byte[] apdu, byte p1, byte p2) {
        int offset = ((p1 & 0xFF) << 8) | (p2 & 0xFF);
        int le = (apdu.length > 4) ? (apdu[apdu.length - 1] & 0xFF) : CC_FILE.length;
        if (le == 0) le = 256; // Le=0x00 means 256 for short encoding

        Log.d(TAG, "READ BINARY CC: offset=" + offset + " le=" + le);

        if (offset >= CC_FILE.length) {
            return SW_WRONG_P1P2;
        }
        int end = Math.min(offset + le, CC_FILE.length);
        byte[] chunk = Arrays.copyOfRange(CC_FILE, offset, end);
        return concat(chunk, SW_OK);
    }

    private byte[] handleReadBinaryNdef(byte[] apdu, byte p1, byte p2) {
        int offset = ((p1 & 0xFF) << 8) | (p2 & 0xFF);
        int le = (apdu.length > 4) ? (apdu[apdu.length - 1] & 0xFF) : 0;
        if (le == 0) le = 256;

        // Full NDEF file = 2-byte NLEN (big-endian) + NDEF message bytes
        byte[] ndefMsg = currentNdefBytes;
        int nlen = ndefMsg.length;
        byte[] ndefFile = new byte[2 + nlen];
        ndefFile[0] = (byte) ((nlen >> 8) & 0xFF);
        ndefFile[1] = (byte) (nlen & 0xFF);
        System.arraycopy(ndefMsg, 0, ndefFile, 2, nlen);

        Log.d(TAG, "READ BINARY NDEF: offset=" + offset + " le=" + le
                + " ndefLen=" + nlen);

        if (offset >= ndefFile.length) {
            return SW_WRONG_P1P2;
        }
        int end = Math.min(offset + le, ndefFile.length);
        byte[] chunk = Arrays.copyOfRange(ndefFile, offset, end);
        return concat(chunk, SW_OK);
    }

    // -----------------------------------------------------------------------
    // NDEF construction helpers
    // -----------------------------------------------------------------------

    /**
     * Builds a default empty NDEF message: a single Well-Known Text record
     * with language "en" and no text content.
     */
    private static byte[] buildDefaultNdef() {
        // Payload for Text record: status byte (0x02 = UTF-8, lang len 2) + "en"
        byte[] payload = {0x02, (byte) 'e', (byte) 'n'};
        return buildNdefRecord((byte) 0x01, new byte[]{(byte) 'T'}, payload);
    }

    /**
     * Parses the payload string format used by HCEService.ts:
     *   "tnf:type:hexPayload|tnf:type:hexPayload|..."
     *
     * Each record is separated by '|'. Within a record:
     *   - tnf       : decimal TNF value (0-7)
     *   - type      : UTF-8 string for the record type (e.g. "T", "U", or MIME type)
     *   - hexPayload: hex-encoded payload bytes
     *
     * Returns a concatenated NDEF message (MB/ME flags set appropriately).
     * Falls back to the default empty NDEF message on any parse error.
     */
    public static byte[] parseNdefPayloadString(String payloadString) {
        if (payloadString == null || payloadString.isEmpty()) {
            Log.d(TAG, "parseNdefPayloadString: empty string, using default");
            return buildDefaultNdef();
        }

        try {
            String[] records = payloadString.split("\\|");
            byte[][] encodedRecords = new byte[records.length][];

            for (int i = 0; i < records.length; i++) {
                String[] parts = records[i].split(":", 3);
                if (parts.length < 3) {
                    Log.d(TAG, "parseNdefPayloadString: bad record format at index " + i);
                    return buildDefaultNdef();
                }

                byte tnf     = (byte) (Integer.parseInt(parts[0].trim()) & 0x07);
                byte[] type  = parts[1].trim().getBytes("UTF-8");
                byte[] payld = hexToBytes(parts[2].trim());

                // Build a short record; MB/ME flags will be patched below
                encodedRecords[i] = buildNdefRecord(tnf, type, payld);
            }

            // Patch MB (Message Begin) on first record and ME (Message End) on last
            if (encodedRecords.length > 0) {
                encodedRecords[0][0]                               |= (byte) 0x80; // MB
                encodedRecords[encodedRecords.length - 1][0]       |= (byte) 0x40; // ME
                // Clear those bits on intermediate records
                for (int i = 1; i < encodedRecords.length - 1; i++) {
                    encodedRecords[i][0] &= (byte) 0x3F;
                }
            }

            // Concatenate all records
            int totalLen = 0;
            for (byte[] r : encodedRecords) totalLen += r.length;
            byte[] message = new byte[totalLen];
            int pos = 0;
            for (byte[] r : encodedRecords) {
                System.arraycopy(r, 0, message, pos, r.length);
                pos += r.length;
            }

            Log.d(TAG, "parseNdefPayloadString: built " + records.length
                    + " record(s), total " + message.length + " bytes");
            return message;

        } catch (Exception e) {
            Log.d(TAG, "parseNdefPayloadString: exception: " + e.getMessage());
            return buildDefaultNdef();
        }
    }

    /**
     * Encodes a single NDEF short record (SR flag always set).
     * MB and ME flags are NOT set here — the caller patches them.
     *
     * Record structure (short record, SR=1):
     *   Byte 0   : flags  = CF(0) | SR(1) | IL(0) | TNF
     *   Byte 1   : type length
     *   Byte 2   : payload length (1 byte, SR)
     *   Bytes 3… : type bytes
     *   Bytes …  : payload bytes
     */
    private static byte[] buildNdefRecord(byte tnf, byte[] type, byte[] payload) {
        byte flags = (byte) (0x10 | (tnf & 0x07)); // SR=1, no MB/ME yet
        byte[] record = new byte[3 + type.length + payload.length];
        record[0] = flags;
        record[1] = (byte) type.length;
        record[2] = (byte) payload.length;
        System.arraycopy(type,    0, record, 3,                  type.length);
        System.arraycopy(payload, 0, record, 3 + type.length,    payload.length);
        return record;
    }

    // -----------------------------------------------------------------------
    // Utility methods
    // -----------------------------------------------------------------------

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] result = new byte[a.length + b.length];
        System.arraycopy(a, 0, result, 0, a.length);
        System.arraycopy(b, 0, result, a.length, b.length);
        return result;
    }

    private static byte[] hexToBytes(String hex) {
        hex = hex.replaceAll("\\s", "");
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                                 + Character.digit(hex.charAt(i + 1), 16));
        }
        return data;
    }

    private static String bytesToHex(byte[] bytes) {
        if (bytes == null) return "<null>";
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02X", b));
        return sb.toString();
    }

    private static void logApdu(String direction, byte[] apdu) {
        Log.d(TAG, direction + " " + bytesToHex(apdu));
    }
}
