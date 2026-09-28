#!/bin/bash
# Demo recording script for API Performance Profiler
# Instructions:
# 1. Install asciinema: `sudo apt install asciinema` or `brew install asciinema`
# 2. Run: `asciinema rec demo.cast -c ./scripts/demo.sh`
# 3. Convert to GIF (optional) using agg: `agg demo.cast demo.gif`

set -e

# Setup trap to kill background processes on exit
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT

echo -e "\033[1;36m[1/4] Starting the Demo Express App with Profiler...\033[0m"
node examples/express/server.js &
SERVER_PID=$!
sleep 2

echo -e "\n\033[1;36m[2/4] Sending some traffic to generate metrics...\033[0m"
curl -s http://127.0.0.1:3000/users/1 > /dev/null
curl -s http://127.0.0.1:3000/users/2 > /dev/null
curl -s http://127.0.0.1:3000/error > /dev/null
sleep 1

echo -e "\n\033[1;36m[3/4] Launching the CLI Profiler Dashboard...\033[0m"
echo -e "(In a real workflow, you would just use the VS Code extension!)\n"
sleep 2

# Run the CLI for a few seconds then kill it
timeout 5 npx api-profiler || true

echo -e "\n\033[1;36m[4/4] Running a 1-click load test on the recorded route...\033[0m"
npx api-profiler run GET /users/:id

echo -e "\n\033[1;32mDemo Complete! The same metrics are available inline in VS Code.\033[0m"
sleep 2
