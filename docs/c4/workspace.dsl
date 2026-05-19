workspace "Calcul8" "C4 architecture model for the Calcul8 local-first sales, sync, realtime, and game-session platform." {
    !identifiers hierarchical

    model {
        !include model/people.dsl
        !include model/software-systems.dsl
        !include model/containers.dsl
        !include model/deployment.dsl
    }

    views {
        !include views/system-landscape.dsl
        !include views/system-context.dsl
        !include views/containers.dsl
        !include views/deployment.dsl
        !include views/dynamics/workspace-sync.dsl
        !include views/dynamics/public-game-session.dsl
        !include views/dynamics/whatnot-import.dsl
        !include views/dynamics/billing-entitlements.dsl

        styles {
            !include styles/theme.dsl
        }
    }

    !adrs decisions adrtools
}

