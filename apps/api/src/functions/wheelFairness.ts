import { app } from "@azure/functions";
import { wheelFairnessCommit, wheelFairnessReveal, wheelFairnessVerify, wheelFairnessProof, wheelFairnessHash } from "../features/wheel/fairnessHandler";

export { wheelFairnessCommit, wheelFairnessReveal, wheelFairnessVerify, wheelFairnessProof, wheelFairnessHash } from "../features/wheel/fairnessHandler";

app.http("wheelFairnessCommit", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/fairness/commit",
  handler: wheelFairnessCommit
});

app.http("wheelFairnessReveal", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/fairness/reveal",
  handler: wheelFairnessReveal
});

app.http("wheelFairnessVerify", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/fairness/verify",
  handler: wheelFairnessVerify
});

app.http("wheelFairnessProof", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/fairness/proof",
  handler: wheelFairnessProof
});

app.http("wheelFairnessHash", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/fairness/hash",
  handler: wheelFairnessHash
});
