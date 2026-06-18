workspace "Calcul8" "C4 architecture model for the Calcul8 local-first sales, sync, realtime, and game-session platform." {
    !identifiers hierarchical
    !impliedRelationships true

    model {
        !include model/people.dsl
        !include model/software-systems.dsl
        !include model/containers.dsl
        !include model/technical-debt.dsl
        !include model/deployment.dsl
    }

    views {
        theme https://raw.githubusercontent.com/structurizr/themes/master/microsoft-azure-2024.07.15/icons.json

        properties {
            "structurizr.sort" "created"
        }

        !include views/system-context.dsl
        !include views/containers.dsl
        !include views/components/web.dsl
        !include views/components/web-adapters.dsl
        !include views/components/api.dsl
        !include views/components/realtime.dsl
        !include views/deployment.dsl
        !include views/dynamics/workspace-sync.dsl
        !include views/dynamics/public-game-session.dsl
        !include views/dynamics/whatnot-import.dsl
        !include views/dynamics/billing-entitlements.dsl
        !include views/dynamics/realtime-publish-subscribe.dsl

        styles {
            !include styles/theme.dsl
        }
    }

    configuration {
        scope softwaresystem
    }
}
