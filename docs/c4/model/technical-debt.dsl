!element calcul8.web {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: the frontend is improving, but large workflow surfaces still concentrate local-first state, mobile polish, and window orchestration risk."
            value "Medium"
        }
    }
}

!element calcul8.web.localStateStore {
    perspectives {
        perspective "Technical Debt" {
            description "High debt: local cache recovery, legacy personal-mode migrations, and scoped storage keys carry the highest data-loss blast radius."
            value "High"
        }
    }
}

!element calcul8.web.syncCoordinator {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: sync conflict recovery now isolates failed queued operations and auto-pulls clean stale-version conflicts, while dirty local edits still require explicit user recovery."
            value "Medium"
        }
    }
}

!element calcul8.web.salesWorkflows {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: sales, live pricing, singles, forecasting, and portfolio screens now share stronger layout contracts, but still need continued mobile-first polish, chart resilience, and branch coverage."
            value "Medium"
        }
    }
}

!element calcul8.web.uiContracts {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: shared UI contracts reduce breakpoint drift, but every new screen must reuse them instead of reintroducing one-off responsive behavior."
            value "Medium"
        }
    }
}

!element calcul8.web.gameWorkflows {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: Wheel, Grid, and Bracket now share one canonical session owner, scoped persistence, typed lifecycle/settlement effects, and narrow leaf capability contracts. Remaining debt is concentrated in large command and inspector presentation surfaces, which should be changed only for proven reuse or product needs."
            value "Medium"
        }
    }
}

!element calcul8.web.whatnotWorkflows {
    perspectives {
        perspective "Technical Debt" {
            description "High debt: import review, CSV handling, OAuth connection state, and mapping review remain high-change surfaces with business-critical correctness requirements."
            value "High"
        }
    }
}

!element calcul8.api {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: API boundaries are thinner, but auth, billing, workspace, sync, Whatnot, and game endpoints still need consistent coverage and guard semantics."
            value "Medium"
        }
    }
}

!element calcul8.api.httpBoundary {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: shared HTTP/auth/CSRF/error behavior is a strong boundary, and every new route needs to keep using it consistently."
            value "Medium"
        }
    }
}

!element calcul8.api.syncWorkspaceServices {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: workspace sync rechecks membership, stale-version writes use guarded conflicts, and creation now activates only after owner membership is durable with idempotent repair on retry."
            value "Medium"
        }
    }
}

!element calcul8.api.billingEntitlementServices {
    perspectives {
        perspective "Technical Debt" {
            description "High debt: access must be derived from provider facts without mixing identity, billing, and entitlement projection responsibilities."
            value "High"
        }
    }
}

!element calcul8.api.whatnotImportServices {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: Whatnot confirmation now freezes decisions, checkpoints operations, and resumes partial writes, while OAuth and provider-facing import behavior remain high-change surfaces."
            value "Medium"
        }
    }
}

!element calcul8.api.cosmosRepositories {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: repositories centralize ids, partitions, retries, and conflicts, but optimistic concurrency behavior must stay consistent across collections."
            value "Medium"
        }
    }
}

!element calcul8.realtime {
    perspectives {
        perspective "Technical Debt" {
            description "Critical debt: realtime remains single-replica because room membership and presence are in memory until a shared backplane exists."
            value "Critical"
        }
    }
}

!element calcul8.realtime.gateway {
    perspectives {
        perspective "Technical Debt" {
            description "High debt: the gateway owns publish, subscribe, lifecycle, and room fan-out in one runtime boundary."
            value "High"
        }
    }
}

!element calcul8.realtime.roomStore {
    perspectives {
        perspective "Technical Debt" {
            description "Critical debt: active room membership is process-local, so horizontal scaling would split subscriptions without Redis, Azure SignalR, or another backplane."
            value "Critical"
        }
    }
}

!element calcul8.realtime.presenceStore {
    perspectives {
        perspective "Technical Debt" {
            description "High debt: presence state is process-local and depends on disciplined cleanup during reconnects, disconnects, and stale subscriptions."
            value "High"
        }
    }
}

!element calcul8.spectator {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: the spectator page now has shared bilingual display, but public-session recovery still needs continued hardening."
            value "Medium"
        }
    }
}
