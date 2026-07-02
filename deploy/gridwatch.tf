data "terraform_remote_state" "tf" {
  backend = "local"
  config = {
    path = "${path.module}/../../tf/terraform.tfstate"
  }
}

data "external" "git" {
  program     = ["git", "log", "--pretty=format:{\"sha\":\"%h\"}", "-n", "1", "HEAD"]
  working_dir = "${path.module}/.."
}

resource "kubernetes_secret_v1" "gridwatch_admin_token" {
  metadata {
    name      = "gridwatch-admin-token"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }
  type = "Opaque"

  data = {
    admin_token = var.gridwatch_admin_token
  }
}

resource "docker_image" "gridwatch_image" {
  # Tag the image with the remote registry address
  name = "${var.registry_host}/${var.image_name}:${data.external.git.result.sha}"

  build {
    context = abspath("${path.module}/..")
  }
  triggers = {
    # Use the latest git commit SHA as a trigger to rebuild the image when the source code changes
    git_sha = data.external.git.result.sha
  }
}

resource "docker_registry_image" "push_myapp" {
  name                 = docker_image.gridwatch_image.name
  keep_remotely        = true
  insecure_skip_verify = true
  auth_config {
    address  = "http://scruffy:32000"
    username = ""
    password = ""
  }
}

resource "kubernetes_namespace_v1" "gridwatch" {
  metadata {
    name = "gridwatch"
  }
}

resource "kubernetes_secret_v1" "gridwatch_tls" {
  metadata {
    name      = "df-ssl-cert"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }
  type = "kubernetes.io/tls"

  data = {
    "tls.crt" = data.terraform_remote_state.tf.outputs.cert_dumpsterfire_cert
    "tls.key" = data.terraform_remote_state.tf.outputs.cert_dumpsterfire_key
  }
}

resource "kubernetes_deployment_v1" "gridwatch" {
  depends_on       = [docker_registry_image.push_myapp]
  wait_for_rollout = false

  metadata {
    name      = "gridwatch"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
    labels = {
      app = "gridwatch"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = "gridwatch"
      }
    }

    template {
      metadata {
        labels = {
          app = "gridwatch"
        }
      }

      spec {
        enable_service_links = false

        container {
          name              = "gridwatch"
          image             = docker_image.gridwatch_image.name
          image_pull_policy = "IfNotPresent"

          port {
            name           = "http"
            container_port = 8000
            protocol       = "TCP"
          }

          env {
            name  = "GRIDWATCH_LOG_LEVEL"
            value = "info"
          }

          env {
            name  = "TZ"
            value = "America/Los_Angeles"
          }

          env {
            name = "GRIDWATCH_ADMIN_TOKEN"
            value_from {
              secret_key_ref {
                name = "gridwatch-admin-token"
                key  = "admin_token"
              }
            }
          }

          env {
            name  = "GRIDWATCH_OPENF1_BASE_URL"
            value = "http://openf1-api:8000/v1"
          }

          env {
            name  = "GRIDWATCH_OPENF1_FALLBACK_URL"
            value = "https://api.openf1.org/v1"
          }

          env {
            name  = "GRIDWATCH_MONGO_CONNECTION_STRING"
            value = "mongodb://openf1-mongodb:27017"
          }

          resources {
            requests = {
              cpu    = "150m"
              memory = "256Mi"
            }
            limits = {
              memory = "512Mi"
            }
          }

          liveness_probe {
            http_get {
              path = "/api/health"
              port = 8000
            }
            initial_delay_seconds = 30
            period_seconds        = 30
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/api/health"
              port = 8000
            }
            initial_delay_seconds = 10
            period_seconds        = 15
            failure_threshold     = 3
          }

        }
      }
    }
  }
}

resource "kubernetes_service_v1" "gridwatch" {
  metadata {
    name      = "gridwatch"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
    labels = {
      app = "gridwatch"
    }
  }

  spec {
    selector = {
      app = "gridwatch"
    }

    port {
      name        = "http"
      port        = 8000
      target_port = 8000
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}

resource "kubernetes_ingress_v1" "gridwatch" {
  metadata {
    name      = "gridwatch-ingress"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
    annotations = {
      "nginx.ingress.kubernetes.io/backend-protocol"   = "HTTP"
      "nginx.ingress.kubernetes.io/upstream-vhost"     = "f1.dumpsterfire.xyz"
      "kubernetes.io/ingress.class"                    = "public"
      "nginx.ingress.kubernetes.io/proxy-body-size"    = "0"
      "nginx.ingress.kubernetes.io/proxy-read-timeout" = "600"
      "nginx.ingress.kubernetes.io/proxy-send-timeout" = "600"
      "nginx.ingress.kubernetes.io/ssl-redirect"       = "true"
      "nginx.ingress.kubernetes.io/force-ssl-redirect" = "true"
    }
    labels = {
      app = "gridwatch"
    }
  }

  spec {
    rule {
      host = "f1.dumpsterfire.xyz"

      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service_v1.gridwatch.metadata[0].name
              port {
                number = 8000
              }
            }
          }
        }
      }
    }

    tls {
      hosts       = ["f1.dumpsterfire.xyz"]
      secret_name = kubernetes_secret_v1.gridwatch_tls.metadata[0].name
    }
  }
}

resource "kubernetes_ingress_v1" "gridwatch_admin" {
  metadata {
    name      = "gridwatch-admin-ingress"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
    annotations = {
      "nginx.ingress.kubernetes.io/backend-protocol"       = "HTTP"
      "nginx.ingress.kubernetes.io/upstream-vhost"         = "f1.dumpsterfire.xyz"
      "kubernetes.io/ingress.class"                        = "public"
      "nginx.ingress.kubernetes.io/ssl-redirect"           = "true"
      "nginx.ingress.kubernetes.io/force-ssl-redirect"     = "true"
      "nginx.ingress.kubernetes.io/whitelist-source-range" = "10.69.0.0/24,100.64.0.0/10"
    }
    labels = {
      app = "gridwatch"
    }
  }

  spec {
    rule {
      host = "f1.dumpsterfire.xyz"

      http {
        path {
          path      = "/admin"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service_v1.gridwatch.metadata[0].name
              port {
                number = 8000
              }
            }
          }
        }
      }
    }

    tls {
      hosts       = ["f1.dumpsterfire.xyz"]
      secret_name = kubernetes_secret_v1.gridwatch_tls.metadata[0].name
    }
  }
}
