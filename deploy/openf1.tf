# Local OpenF1 instance — gridwatch namespace
# Requires: git clone https://github.com/br-g/openf1 ~/git/openf1

data "external" "openf1_git" {
  program     = ["git", "log", "--pretty=format:{\"sha\":\"%h\"}", "-n", "1", "HEAD"]
  working_dir = "${var.home}/git/openf1"
}

resource "docker_image" "f1tv_refresh" {
  name = "${var.registry_host}/f1tv-refresh:latest"
  build {
    context    = "${path.module}/scripts/f1tv-refresh"
    dockerfile = "Dockerfile"
  }
  triggers = {
    dockerfile = filesha256("${path.module}/scripts/f1tv-refresh/Dockerfile")
  }
}

resource "docker_registry_image" "f1tv_refresh" {
  name                 = docker_image.f1tv_refresh.name
  keep_remotely        = true
  insecure_skip_verify = true
  auth_config {
    address  = "http://scruffy:32000"
    username = ""
    password = ""
  }
}

resource "docker_image" "openf1" {
  name = "${var.registry_host}/openf1:${data.external.openf1_git.result.sha}"
  build {
    context = "${var.home}/git/openf1"
  }
  triggers = {
    git_sha = data.external.openf1_git.result.sha
  }
}

resource "docker_registry_image" "openf1" {
  name                 = docker_image.openf1.name
  keep_remotely        = true
  insecure_skip_verify = true
  auth_config {
    address  = "http://scruffy:32000"
    username = ""
    password = ""
  }
}

# ── MongoDB ────────────────────────────────────────────────────────────────────

resource "kubernetes_deployment_v1" "openf1_mongodb" {
  metadata {
    name      = "openf1-mongodb"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
    labels    = { app = "openf1-mongodb" }
  }

  spec {
    replicas = 1
    selector { match_labels = { app = "openf1-mongodb" } }

    template {
      metadata { labels = { app = "openf1-mongodb" } }
      spec {
        enable_service_links = false

        volume {
          name = "data"
          host_path {
            path = "/mnt/apps/openf1/mongo"
            type = "DirectoryOrCreate"
          }
        }

        container {
          name              = "mongodb"
          image             = "mongo:8"
          image_pull_policy = "IfNotPresent"

          port { container_port = 27017 }

          volume_mount {
            name       = "data"
            mount_path = "/data/db"
          }

          resources {
            requests = { cpu = "100m", memory = "512Mi" }
            limits   = { memory = "2Gi" }
          }

          liveness_probe {
            exec { command = ["mongosh", "--eval", "db.adminCommand('ping')"] }
            initial_delay_seconds = 30
            period_seconds        = 30
            failure_threshold     = 3
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "openf1_mongodb" {
  metadata {
    name      = "openf1-mongodb"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
    labels    = { app = "openf1-mongodb" }
  }
  spec {
    selector = { app = "openf1-mongodb" }
    port {
      port        = 27017
      target_port = 27017
      protocol    = "TCP"
    }
    type = "ClusterIP"
  }
}

# ── MQTT broker (Mosquitto) ────────────────────────────────────────────────────

resource "kubernetes_config_map_v1" "openf1_mqtt_config" {
  metadata {
    name      = "openf1-mqtt-config"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }
  data = {
    "mosquitto.conf" = <<-EOT
      listener 1883
      allow_anonymous true
      persistence false
    EOT
  }
}

resource "kubernetes_deployment_v1" "openf1_mqtt" {
  metadata {
    name      = "openf1-mqtt"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
    labels    = { app = "openf1-mqtt" }
  }

  spec {
    replicas = 1
    selector { match_labels = { app = "openf1-mqtt" } }

    template {
      metadata { labels = { app = "openf1-mqtt" } }
      spec {
        enable_service_links = false

        volume {
          name = "config"
          config_map { name = kubernetes_config_map_v1.openf1_mqtt_config.metadata[0].name }
        }

        container {
          name              = "mosquitto"
          image             = "eclipse-mosquitto:2"
          image_pull_policy = "IfNotPresent"

          port { container_port = 1883 }

          volume_mount {
            name       = "config"
            mount_path = "/mosquitto/config"
          }

          resources {
            requests = { cpu = "10m", memory = "32Mi" }
            limits   = { memory = "64Mi" }
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "openf1_mqtt" {
  metadata {
    name      = "openf1-mqtt"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
    labels    = { app = "openf1-mqtt" }
  }
  spec {
    selector = { app = "openf1-mqtt" }
    port {
      port        = 1883
      target_port = 1883
      protocol    = "TCP"
    }
    type = "ClusterIP"
  }
}

# ── OpenF1 Query API ───────────────────────────────────────────────────────────

resource "kubernetes_deployment_v1" "openf1_api" {
  depends_on = [docker_registry_image.openf1]

  metadata {
    name      = "openf1-api"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
    labels    = { app = "openf1-api" }
  }

  spec {
    replicas = 1
    selector { match_labels = { app = "openf1-api" } }

    template {
      metadata { labels = { app = "openf1-api" } }
      spec {
        enable_service_links = false

        container {
          name              = "openf1-api"
          image             = docker_image.openf1.name
          image_pull_policy = "IfNotPresent"

          env {
            name  = "ROLE"
            value = "api"
          }
          env {
            name  = "MONGO_CONNECTION_STRING"
            value = "mongodb://openf1-mongodb:27017"
          }
          env {
            name  = "OPENF1_DB_NAME"
            value = "openf1-livetiming"
          }
          env {
            name  = "OPENF1_BASE_URL"
            value = "http://openf1-api:8000/"
          }


          port {
            name           = "http"
            container_port = 8000
            protocol       = "TCP"
          }

          resources {
            requests = { cpu = "50m", memory = "128Mi" }
            limits   = { memory = "512Mi" }
          }

          liveness_probe {
            http_get {
              path = "/v1/sessions"
              port = 8000
            }
            initial_delay_seconds = 30
            period_seconds        = 30
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/v1/sessions"
              port = 8000
            }
            initial_delay_seconds = 15
            period_seconds        = 10
            failure_threshold     = 3
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "openf1_api" {
  metadata {
    name      = "openf1-api"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
    labels    = { app = "openf1-api" }
  }
  spec {
    selector = { app = "openf1-api" }
    port {
      name        = "http"
      port        = 8000
      target_port = 8000
      protocol    = "TCP"
    }
    type = "ClusterIP"
  }
}

# ── F1TV credentials secret (seeded from tfvars; token field auto-refreshed) ──

resource "kubernetes_secret_v1" "openf1_f1tv" {
  metadata {
    name      = "openf1-f1tv"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }
  data = {
    email    = var.f1tv_email
    password = var.f1tv_password
    token    = ""
  }
  lifecycle {
    ignore_changes = [data]
  }
}

# ── Realtime ingestor (scaled by openf1-scale-ingest CronJob) ────────────────

resource "kubernetes_deployment_v1" "openf1_ingest_realtime" {
  depends_on = [docker_registry_image.openf1]

  metadata {
    name      = "openf1-ingest-realtime"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
    labels    = { app = "openf1-ingest-realtime" }
  }

  lifecycle {
    ignore_changes = [spec[0].replicas]
  }

  spec {
    replicas = 0
    selector { match_labels = { app = "openf1-ingest-realtime" } }

    template {
      metadata { labels = { app = "openf1-ingest-realtime" } }
      spec {
        enable_service_links = false

        container {
          name              = "ingest-realtime"
          image             = docker_image.openf1.name
          image_pull_policy = "IfNotPresent"

          env {
            name  = "ROLE"
            value = "ingest-realtime"
          }
          env {
            name  = "MONGO_CONNECTION_STRING"
            value = "mongodb://openf1-mongodb:27017"
          }
          env {
            name  = "OPENF1_DB_NAME"
            value = "openf1-livetiming"
          }
          env {
            name  = "OPENF1_MQTT_URL"
            value = "openf1-mqtt"
          }
          env {
            name  = "OPENF1_MQTT_PORT"
            value = "1883"
          }
          env {
            name  = "OPENF1_MQTT_USERNAME"
            value = "openf1"
          }
          env {
            name  = "OPENF1_MQTT_PASSWORD"
            value = "openf1"
          }
          env {
            name  = "OPENF1_MQTT_NO_TLS"
            value = "true"
          }
          env {
            name  = "OPENF1_BASE_URL"
            value = "http://openf1-api:8000/"
          }
          env {
            name = "F1_TOKEN"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.openf1_f1tv.metadata[0].name
                key  = "token"
              }
            }
          }

          resources {
            requests = { cpu = "50m", memory = "128Mi" }
            limits   = { memory = "256Mi" }
          }
        }
      }
    }
  }
}

# ── CronJob: ingest meetings + sessions — daily at 04:00 ──────────────────────

resource "kubernetes_cron_job_v1" "openf1_ingest_schedule" {
  depends_on = [docker_registry_image.openf1]

  metadata {
    name      = "openf1-ingest-schedule"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }

  spec {
    schedule                      = "0 4 * * *"
    concurrency_policy            = "Forbid"
    failed_jobs_history_limit     = 3
    successful_jobs_history_limit = 1

    job_template {
      metadata {}
      spec {
        template {
          metadata {}
          spec {
            restart_policy       = "OnFailure"
            enable_service_links = false

            container {
              name              = "ingest-schedule"
              image             = docker_image.openf1.name
              image_pull_policy = "IfNotPresent"
              command           = ["/bin/sh", "-c"]
              args              = ["python -m openf1.services.f1_scraping.schedule ingest-meetings && python -m openf1.services.f1_scraping.schedule ingest-sessions"]

              env {
                name  = "MONGO_CONNECTION_STRING"
                value = "mongodb://openf1-mongodb:27017"
              }
              env {
                name  = "OPENF1_DB_NAME"
                value = "openf1-livetiming"
              }

              resources {
                requests = { cpu = "50m", memory = "128Mi" }
                limits   = { memory = "256Mi" }
              }
            }
          }
        }
      }
    }
  }
}

# ── CronJob: ingest session results + starting grid — hourly at :15 ───────────

resource "kubernetes_cron_job_v1" "openf1_ingest_results" {
  depends_on = [docker_registry_image.openf1]

  metadata {
    name      = "openf1-ingest-results"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }

  spec {
    schedule                      = "15 * * * *"
    concurrency_policy            = "Forbid"
    failed_jobs_history_limit     = 3
    successful_jobs_history_limit = 1

    job_template {
      metadata {}
      spec {
        template {
          metadata {}
          spec {
            restart_policy       = "OnFailure"
            enable_service_links = false

            container {
              name              = "ingest-results"
              image             = docker_image.openf1.name
              image_pull_policy = "IfNotPresent"
              command           = ["/bin/sh", "-c"]
              args              = ["python -m openf1.services.f1_scraping.session_result && (python -m openf1.services.f1_scraping.starting_grid || true)"]

              env {
                name  = "MONGO_CONNECTION_STRING"
                value = "mongodb://openf1-mongodb:27017"
              }
              env {
                name  = "OPENF1_DB_NAME"
                value = "openf1-livetiming"
              }

              resources {
                requests = { cpu = "50m", memory = "128Mi" }
                limits   = { memory = "256Mi" }
              }
            }
          }
        }
      }
    }
  }
}

# ── Gap-fill script + CronJob — daily at 03:00 ────────────────────────────────
# Imports timing data for any sessions present on openf1.org but not yet in
# local MongoDB. On first run against an empty DB this is a full bootstrap.

resource "kubernetes_config_map_v1" "openf1_gap_fill_script" {
  metadata {
    name      = "openf1-gap-fill-script"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }
  data = {
    "gap_fill.py" = file("${path.module}/../backend/scripts/gap_fill.py")
  }
}

resource "kubernetes_cron_job_v1" "openf1_gap_fill" {
  depends_on = [docker_registry_image.openf1]

  metadata {
    name      = "openf1-gap-fill"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }

  spec {
    schedule                      = "0 3,15 * * *"
    concurrency_policy            = "Forbid"
    failed_jobs_history_limit     = 3
    successful_jobs_history_limit = 1

    job_template {
      metadata {}
      spec {
        template {
          metadata {}
          spec {
            restart_policy       = "OnFailure"
            enable_service_links = false

            container {
              name              = "gap-fill"
              image             = docker_image.openf1.name
              image_pull_policy = "IfNotPresent"
              command           = ["python", "/scripts/gap_fill.py"]

              env {
                name  = "MONGO_CONNECTION_STRING"
                value = "mongodb://openf1-mongodb:27017"
              }
              env {
                name  = "OPENF1_DB_NAME"
                value = "openf1-livetiming"
              }
              env {
                name  = "OPENF1_SOURCE_URL"
                value = "https://api.openf1.org/v1"
              }

              volume_mount {
                name       = "script"
                mount_path = "/scripts"
              }

              resources {
                requests = { cpu = "50m", memory = "128Mi" }
                limits   = { memory = "512Mi" }
              }
            }

            volume {
              name = "script"
              config_map { name = kubernetes_config_map_v1.openf1_gap_fill_script.metadata[0].name }
            }
          }
        }
      }
    }
  }
}

# ── F1TV token refresh CronJob — daily at 06:00 ───────────────────────────────
# Fetches a fresh SubscriptionToken from F1's auth API, patches the secret,
# then does a rollout restart so the ingest pod picks up the new value.
# Token lifetime is ~4 days; running daily ensures it never expires mid-session.

resource "kubernetes_service_account_v1" "openf1_token_refresher" {
  metadata {
    name      = "openf1-token-refresher"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }
}

resource "kubernetes_role_v1" "openf1_token_refresher" {
  metadata {
    name      = "openf1-token-refresher"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }
  rule {
    api_groups = [""]
    resources  = ["secrets"]
    verbs      = ["get", "patch"]
  }
  rule {
    api_groups = ["apps"]
    resources  = ["deployments"]
    verbs      = ["get", "patch"]
  }
}

resource "kubernetes_role_binding_v1" "openf1_token_refresher" {
  metadata {
    name      = "openf1-token-refresher"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }
  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role_v1.openf1_token_refresher.metadata[0].name
  }
  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account_v1.openf1_token_refresher.metadata[0].name
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }
}

resource "kubernetes_config_map_v1" "openf1_refresh_token_script" {
  metadata {
    name      = "openf1-refresh-token-script"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }
  data = {
    "refresh_token.py" = file("${path.module}/scripts/f1tv-refresh/refresh_token.py")
  }
}

resource "kubernetes_cron_job_v1" "openf1_refresh_token" {
  metadata {
    name      = "openf1-refresh-token"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }

  spec {
    schedule                      = "0 6 * * *"
    concurrency_policy            = "Forbid"
    failed_jobs_history_limit     = 3
    successful_jobs_history_limit = 1

    job_template {
      metadata {}
      spec {
        template {
          metadata {}
          spec {
            restart_policy       = "OnFailure"
            enable_service_links = false
            service_account_name = kubernetes_service_account_v1.openf1_token_refresher.metadata[0].name

            container {
              name    = "refresh-token"
              image   = docker_registry_image.f1tv_refresh.name
              command = ["python", "/scripts/refresh_token.py"]

              env {
                name = "F1TV_EMAIL"
                value_from {
                  secret_key_ref {
                    name = kubernetes_secret_v1.openf1_f1tv.metadata[0].name
                    key  = "email"
                  }
                }
              }
              env {
                name = "F1TV_PASSWORD"
                value_from {
                  secret_key_ref {
                    name = kubernetes_secret_v1.openf1_f1tv.metadata[0].name
                    key  = "password"
                  }
                }
              }

              volume_mount {
                name       = "script"
                mount_path = "/scripts"
              }

              resources {
                requests = { cpu = "100m", memory = "512Mi" }
                limits   = { memory = "1Gi" }
              }
            }

            volume {
              name = "script"
              config_map { name = kubernetes_config_map_v1.openf1_refresh_token_script.metadata[0].name }
            }
          }
        }
      }
    }
  }
}

# ── Session-aware ingest scaler — runs every 30 min ──────────────────────────
# Scales openf1-ingest-realtime to 1 when a session starts within 1h or ended
# within 30min (2h window back covers race ~1.5h + 30min buffer), else scales to 0.

resource "kubernetes_config_map_v1" "openf1_scale_ingest_script" {
  metadata {
    name      = "openf1-scale-ingest-script"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }
  data = {
    "scale_ingest.py" = file("${path.module}/scripts/openf1-scaler/scale_ingest.py")
  }
}

resource "kubernetes_cron_job_v1" "openf1_scale_ingest" {
  metadata {
    name      = "openf1-scale-ingest"
    namespace = kubernetes_namespace_v1.gridwatch.metadata[0].name
  }

  spec {
    schedule                      = "*/30 * * * *"
    concurrency_policy            = "Replace"
    failed_jobs_history_limit     = 3
    successful_jobs_history_limit = 1

    job_template {
      metadata {}
      spec {
        template {
          metadata {}
          spec {
            restart_policy       = "OnFailure"
            enable_service_links = false
            service_account_name = kubernetes_service_account_v1.openf1_token_refresher.metadata[0].name

            container {
              name    = "scaler"
              image   = "python:3.12-slim"
              command = ["/bin/sh", "-c"]
              args    = ["pip install kubernetes requests --quiet && python /scripts/scale_ingest.py"]

              volume_mount {
                name       = "script"
                mount_path = "/scripts"
              }

              resources {
                requests = { cpu = "50m", memory = "64Mi" }
                limits   = { memory = "128Mi" }
              }
            }

            volume {
              name = "script"
              config_map { name = kubernetes_config_map_v1.openf1_scale_ingest_script.metadata[0].name }
            }
          }
        }
      }
    }
  }
}
