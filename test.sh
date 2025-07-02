#!/usr/bin/env bash

clear
rm -rf notion-export-2025-07-01
time bin/dev.js export \
  --concurrency 10 \
  --rate 25 \
  --size 50 \
  --debug \
  --verbose
