import assert from "node:assert/strict";
import test from "node:test";
import { resolveGlobalWink, resetGlobalWinkInit } from "../src/integrations/wink/useWinkIntegration.ts";

test("Wink SDK v1 Integration (13_dice) - Standalone fallback", async () => {
  resetGlobalWinkInit();
  delete globalThis.Wink;
  delete globalThis.WinkBridge;

  const sdk = await resolveGlobalWink();
  assert.equal(sdk, null, "Wink SDK resolves null in standalone mode");
});

test("Wink SDK v1 Integration (13_dice) - Connected mode", async () => {
  let startCalled = false;
  let stopCalled = false;
  let trackCalled = false;

  const mockSdk = {
    init: async () => mockSdk,
    gameplayStart: () => {
      startCalled = true;
    },
    gameplayStop: () => {
      stopCalled = true;
    },
    track: async () => {
      trackCalled = true;
    },
    can: () => true,
    status: "online",
  };

  resetGlobalWinkInit();
  globalThis.window = globalThis;
  globalThis.Wink = mockSdk;

  const sdk = await resolveGlobalWink();
  assert.notEqual(sdk, null, "Resolves mockSdk when window.Wink present");

  sdk.gameplayStart();
  assert.equal(startCalled, true, "gameplayStart called");

  sdk.gameplayStop();
  assert.equal(stopCalled, true, "gameplayStop called");

  sdk.track("dice_roll", { value: 6 });
  assert.equal(trackCalled, true, "track called");
});
