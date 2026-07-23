import { installMemoriesOntology } from "@khoralabs/agent-net-harness";

import { referenceMemoriesOntology } from "../memories/ontology.ts";
import { installReferenceObservability } from "../observability/install.ts";

installReferenceObservability({ serviceName: "network-harness-agent" });
installMemoriesOntology(referenceMemoriesOntology);
