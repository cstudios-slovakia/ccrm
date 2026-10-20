import assert from "node:assert/strict";
import test from "node:test";
import {
  b64uToBuffer,
  bufferToB64u,
  defaultPasskeyName,
  toCreationOptions,
  toRequestOptions,
  creationCredentialToJson,
  assertionCredentialToJson,
  passkeyErrorKind,
  formatAgo,
  shouldOfferPasskeySetup,
  type PasskeyOfferState,
} from "./passkeys.ts";

test("base64url round-trip handles characters producing +, / and = in standard base64", () => {
  // Test byte sequences that produce +, / and padding in standard base64:
  // e.g. 0xfb, 0xff, 0xbf, etc.
  const testBytes = [
    new Uint8Array([0xfb, 0xff, 0xfe]), // produces + and /
    new Uint8Array([0x00]),             // produces ==
    new Uint8Array([0x00, 0x00]),       // produces =
    new Uint8Array([251, 239, 190, 189, 255, 0, 1, 2, 3]),
    new Uint8Array(256).map((_, i) => i), // all 256 byte values
  ];

  for (const orig of testBytes) {
    const encoded = bufferToB64u(orig.buffer);
    assert.ok(!encoded.includes("+"), `Encoded ${encoded} should not contain +`);
    assert.ok(!encoded.includes("/"), `Encoded ${encoded} should not contain /`);
    assert.ok(!encoded.includes("="), `Encoded ${encoded} should not contain =`);

    const decoded = new Uint8Array(b64uToBuffer(encoded));
    assert.deepEqual(decoded, orig, "Decoded buffer matches original");
  }
});

test("defaultPasskeyName correctly detects combinations of Browser and OS", () => {
  // Chrome on Windows
  const chromeWin = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  assert.equal(defaultPasskeyName(chromeWin), "Chrome on Windows");

  // Safari on iPhone
  const safariIphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  assert.equal(defaultPasskeyName(safariIphone), "Safari on iPhone");

  // Edge on Windows
  const edgeWin = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
  assert.equal(defaultPasskeyName(edgeWin), "Edge on Windows");

  // Firefox on Android
  const ffAndroid = "Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0";
  assert.equal(defaultPasskeyName(ffAndroid), "Firefox on Android");

  // Unknown UA -> ""
  assert.equal(defaultPasskeyName("CustomBot/1.0"), "");
  assert.equal(defaultPasskeyName(""), "");
});

test("toCreationOptions and toRequestOptions convert base64url strings to ArrayBuffers", () => {
  const creationJson = {
    rp: { name: "CCRM", id: "localhost" },
    user: { id: "dXNlci1pZA", name: "user@test.com", displayName: "User" },
    challenge: "Y2hhbGxlbmdlLWJ5dGVz",
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 60000,
    excludeCredentials: [
      { type: "public-key", id: "ZXhjbHVkZS0x" },
      { type: "public-key", id: "ZXhjbHVkZS0y" },
    ],
  };

  const creationOptions = toCreationOptions(creationJson);
  assert.ok(creationOptions.challenge instanceof ArrayBuffer, "challenge is ArrayBuffer");
  assert.ok(creationOptions.user.id instanceof ArrayBuffer, "user.id is ArrayBuffer");
  assert.equal(creationOptions.excludeCredentials?.length, 2);
  assert.ok(creationOptions.excludeCredentials![0].id instanceof ArrayBuffer, "excludeCredentials[0].id is ArrayBuffer");
  assert.ok(creationOptions.excludeCredentials![1].id instanceof ArrayBuffer, "excludeCredentials[1].id is ArrayBuffer");

  const requestJson = {
    challenge: "cmVxdWVzdC1jaGFsbGVuZ2U",
    rpId: "localhost",
    allowCredentials: [{ type: "public-key", id: "YWxsb3ctMQ" }],
  };

  const requestOptions = toRequestOptions(requestJson);
  assert.ok(requestOptions.challenge instanceof ArrayBuffer, "challenge is ArrayBuffer");
  assert.equal(requestOptions.allowCredentials?.length, 1);
  assert.ok(requestOptions.allowCredentials![0].id instanceof ArrayBuffer, "allowCredentials[0].id is ArrayBuffer");
});

test("creationCredentialToJson and assertionCredentialToJson produce expected serialized JSON", () => {
  const fakeCreationCred = {
    id: "cred-123",
    rawId: new Uint8Array([1, 2, 3]).buffer,
    type: "public-key",
    response: {
      clientDataJSON: new Uint8Array([4, 5, 6]).buffer,
      attestationObject: new Uint8Array([7, 8, 9]).buffer,
      getTransports: () => ["internal"],
    },
    getClientExtensionResults: () => ({}),
  };

  const creationJson = creationCredentialToJson(fakeCreationCred);
  assert.equal(creationJson.id, "cred-123");
  assert.equal(creationJson.rawId, bufferToB64u(new Uint8Array([1, 2, 3]).buffer));
  assert.equal(creationJson.response.clientDataJSON, bufferToB64u(new Uint8Array([4, 5, 6]).buffer));
  assert.equal(creationJson.response.attestationObject, bufferToB64u(new Uint8Array([7, 8, 9]).buffer));
  assert.deepEqual(creationJson.response.transports, ["internal"]);

  const fakeAssertionCred = {
    id: "cred-456",
    rawId: new Uint8Array([10, 11, 12]).buffer,
    type: "public-key",
    response: {
      clientDataJSON: new Uint8Array([13, 14, 15]).buffer,
      authenticatorData: new Uint8Array([16, 17, 18]).buffer,
      signature: new Uint8Array([19, 20, 21]).buffer,
      userHandle: new Uint8Array([22, 23, 24]).buffer,
    },
    getClientExtensionResults: () => ({}),
  };

  const assertionJson = assertionCredentialToJson(fakeAssertionCred);
  assert.equal(assertionJson.id, "cred-456");
  assert.equal(assertionJson.rawId, bufferToB64u(new Uint8Array([10, 11, 12]).buffer));
  assert.equal(assertionJson.response.clientDataJSON, bufferToB64u(new Uint8Array([13, 14, 15]).buffer));
  assert.equal(assertionJson.response.authenticatorData, bufferToB64u(new Uint8Array([16, 17, 18]).buffer));
  assert.equal(assertionJson.response.signature, bufferToB64u(new Uint8Array([19, 20, 21]).buffer));
  assert.equal(assertionJson.response.userHandle, bufferToB64u(new Uint8Array([22, 23, 24]).buffer));
});

test("passkeyErrorKind correctly classifies DOMExceptions", () => {
  assert.equal(passkeyErrorKind({ name: "NotAllowedError" }), "cancelled");
  assert.equal(passkeyErrorKind({ name: "AbortError" }), "cancelled");
  assert.equal(passkeyErrorKind({ name: "InvalidStateError" }), "excluded");
  assert.equal(passkeyErrorKind({ name: "UnknownError" }), "other");
  assert.equal(passkeyErrorKind(new Error("Generic error")), "other");
  assert.equal(passkeyErrorKind(null), "other");
});

test("formatAgo formats seconds into localized relative strings", () => {
  // English tests
  assert.equal(formatAgo(30, "en"), "30 seconds ago");
  assert.equal(formatAgo(300, "en"), "5 minutes ago");
  assert.equal(formatAgo(10800, "en"), "3 hours ago");
  assert.equal(formatAgo(259200, "en"), "3 days ago");

  // Handles null / undefined
  assert.equal(formatAgo(null, "en"), "");
  assert.equal(formatAgo(undefined, "en"), "");
});

const eligible: PasskeyOfferState = {
  loginMethod: "password",
  available: true,
  platformAvailable: true,
  onThisDevice: false,
  dismissed: false,
};

test("shouldOfferPasskeySetup offers after a password login on a capable, unregistered device", () => {
  assert.equal(shouldOfferPasskeySetup(eligible), true);
});

test("shouldOfferPasskeySetup stays quiet unless every condition holds", () => {
  const blockers: Partial<PasskeyOfferState>[] = [
    { loginMethod: "passkey" },
    { loginMethod: "reset" },
    { loginMethod: null },
    { available: false },
    { platformAvailable: false },
    { onThisDevice: true },
    { dismissed: true },
  ];
  for (const blocker of blockers) {
    assert.equal(shouldOfferPasskeySetup({ ...eligible, ...blocker }), false, JSON.stringify(blocker));
  }
});

test("toCreationOptions passes hints through untouched", () => {
  const options = toCreationOptions({
    challenge: "AQID",
    rp: { name: "CCRM", id: "localhost" },
    user: { id: "AQID", name: "a@b.c", displayName: "A" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    hints: ["client-device"],
  });
  assert.deepEqual((options as { hints?: string[] }).hints, ["client-device"]);
});
