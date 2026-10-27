import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_MODEL_LUNA,
  AI_MODEL_SOL,
  AI_MODEL_TERRA,
  upgradeAiModel,
  upgradeSwarmModel,
} from "./aiModels.ts";

test("stored chat models move to the cheaper GPT-6 tier", () => {
  assert.equal(upgradeAiModel("gpt-5.6-luna", AI_MODEL_TERRA), AI_MODEL_LUNA);
  assert.equal(upgradeAiModel("gpt-4o-mini", AI_MODEL_TERRA), AI_MODEL_LUNA);
  assert.equal(upgradeAiModel("gpt-5.6-terra", AI_MODEL_LUNA), AI_MODEL_TERRA);
  assert.equal(upgradeAiModel("gpt-4o", AI_MODEL_LUNA), AI_MODEL_TERRA);
  assert.equal(upgradeAiModel("gpt-5.6-sol", AI_MODEL_LUNA), AI_MODEL_SOL);
});

test("a current id and an unknown id are left alone", () => {
  assert.equal(upgradeAiModel(AI_MODEL_LUNA, AI_MODEL_TERRA), AI_MODEL_LUNA);
  assert.equal(upgradeAiModel("claude-sonnet-5-5", AI_MODEL_LUNA), "claude-sonnet-5-5");
  assert.equal(upgradeAiModel("", AI_MODEL_TERRA), AI_MODEL_TERRA);
  assert.equal(upgradeAiModel(null, AI_MODEL_LUNA), AI_MODEL_LUNA);
});

test("a swarm rehearsal only keeps Luna or Terra", () => {
  assert.equal(upgradeSwarmModel("gpt-5.6-luna"), AI_MODEL_LUNA);
  assert.equal(upgradeSwarmModel("gpt-4o"), AI_MODEL_TERRA);
  assert.equal(upgradeSwarmModel("gpt-5.6-sol"), AI_MODEL_TERRA);
  assert.equal(upgradeSwarmModel("something-else"), AI_MODEL_LUNA);
});
