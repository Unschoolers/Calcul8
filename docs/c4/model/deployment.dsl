development = deploymentEnvironment "Development" {
    devMachine = deploymentNode "Developer workstation" "Local Windows development machine." "Windows, PowerShell, Docker Desktop" {
        localWeb = containerInstance calcul8.web
        localSpectator = containerInstance calcul8.spectator
        localStructurizr = infrastructureNode "Structurizr local" "Local-only architecture viewer on http://localhost:8080." "Docker image: structurizr/structurizr local" {
            tags "Tooling"
        }
    }

    localDocker = deploymentNode "Local Docker" "Optional local container runtime." "Docker" {
        localRealtime = containerInstance calcul8.realtime
    }
}

production = deploymentEnvironment "Production" {
    azure = deploymentNode "Azure" "Production hosting boundary." "Azure" {
        staticSite = deploymentNode "Static web hosting" "Ships the PWA and spectator entry." {
            prodWeb = containerInstance calcul8.web
            prodSpectator = containerInstance calcul8.spectator
        }

        functions = deploymentNode "Azure Functions" "Production API host." {
            prodApi = containerInstance calcul8.api
        }

        realtimeHost = deploymentNode "Realtime host" "Production realtime gateway. Keep single-instance until a shared backplane exists." {
            prodRealtime = containerInstance calcul8.realtime
        }

        database = deploymentNode "Cosmos account" "Production data plane." {
            prodCosmos = containerInstance calcul8.cosmos
        }
    }
}
