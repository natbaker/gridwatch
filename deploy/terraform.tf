terraform {
  required_providers {
    kubernetes = {
      source = "hashicorp/kubernetes"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kubeconfig_context
}

provider "docker" {
  registry_auth {
    address = "localhost:32000"
  }
}
