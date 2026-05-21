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
            description "High debt: sync conflict recovery is safer than before, but it remains one of the most failure-sensitive cross-boundary flows."
            value "High"
        }
    }
}

!element calcul8.web.salesWorkflows {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: sales, live pricing, singles, forecasting, and portfolio screens are broad workflow clusters that need continued mobile-first polish and branch coverage."
            value "Medium"
        }
    }
}

!element calcul8.web.gameWorkflows {
    perspectives {
        perspective "Technical Debt" {
            description "Medium debt: wheel, grid, public session, stage, and spectator behavior has been split, but game surfaces still carry complex UI/runtime coupling."
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
            description "High debt: workspace membership, scoped sync, stale-version conflicts, and access-loss recovery remain concurrency-sensitive."
            value "High"
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
            description "High debt: Whatnot OAuth credentials, import batches, review decisions, and mapping persistence still need sharp ownership and branch coverage."
            value "High"
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
