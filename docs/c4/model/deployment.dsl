development = deploymentEnvironment "Development" {
    devMachine = deploymentNode "Developer workstation" "Local Windows development machine." "Windows, PowerShell, Docker Desktop" {
        localWeb = containerInstance calcul8.web
        localSpectator = containerInstance calcul8.spectator
    }

    localDocker = deploymentNode "Local Docker" "Optional local container runtime." "Docker" {
        localRealtime = containerInstance calcul8.realtime
    }
}

production = deploymentEnvironment "Production" {
    azure = deploymentNode "Azure" "Production hosting boundary." "Azure" {
        tags "Microsoft Azure - Azure A"

        staticSite = deploymentNode "Static web hosting" "Ships the PWA and spectator entry." "Azure Static Web Apps / Pages" {
            tags "Microsoft Azure - Static Apps"

            prodWeb = containerInstance calcul8.web
            prodSpectator = containerInstance calcul8.spectator
        }

        functions = deploymentNode "Azure Functions" "Production API host." "Azure Functions v4" {
            tags "Microsoft Azure - Function Apps"

            prodApi = containerInstance calcul8.api
        }

        realtimeHost = deploymentNode "Realtime host" "Production realtime gateway. Keep single-instance until a shared backplane exists." "Azure App Service / Container host" {
            tags "Microsoft Azure - App Services"

            prodRealtime = containerInstance calcul8.realtime
        }

        database = deploymentNode "Cosmos account" "Production data plane." "Azure Cosmos DB" {
            tags "Microsoft Azure - Azure Cosmos DB"

            prodCosmos = containerInstance calcul8.cosmos
        }
    }
}
