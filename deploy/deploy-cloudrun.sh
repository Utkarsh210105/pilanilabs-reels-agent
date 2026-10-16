#!/usr/bin/env bash
# Deploys the reels agent to Cloud Run in PilaniLabs' own Google Cloud project.
#
# Always uses the separate "pilanilabs" gcloud configuration (never the
# default one, which belongs to another company), via CLOUDSDK_ACTIVE_CONFIG_NAME.
#
# One-time: see README "Deploying to Cloud Run".
# Usage:  bash deploy/deploy-cloudrun.sh
set -euo pipefail
export CLOUDSDK_ACTIVE_CONFIG_NAME=pilanilabs

PROJECT="$(gcloud config get-value project 2>/dev/null)"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-reels-agent}"
BUCKET="${BUCKET:-${PROJECT}-reels-media}"
ENV_FILE="$(dirname "$0")/cloudrun.env.yaml"

[ -n "$PROJECT" ] || { echo "No project set in the pilanilabs gcloud configuration."; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy deploy/cloudrun.env.example.yaml and fill it in)."; exit 1; }
echo "Project: $PROJECT  Region: $REGION  Service: $SERVICE  Bucket: gs://$BUCKET"

# Media bucket (videos, thumbnails), mounted into the container at /mnt/media.
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access

# One always-on instance with CPU always allocated: the in-app schedules
# (6am news, Monday scrape, scheduled Instagram posts) and background renders
# need it. max-instances=1 so schedules never run twice.
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --execution-environment gen2 \
  --cpu 1 --memory 2Gi \
  --min-instances 1 --max-instances 1 \
  --no-cpu-throttling \
  --timeout 3600 \
  --env-vars-file "$ENV_FILE" \
  --add-volume name=media,type=cloud-storage,bucket="$BUCKET" \
  --add-volume-mount volume=media,mount-path=/mnt/media \
  --allow-unauthenticated

echo "Deployed: $(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
