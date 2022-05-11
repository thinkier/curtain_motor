#!/usr/bin/env python3

from flask import Flask, jsonify
from gpiozero import DigitalOutputDevice
from signal import signal, SIGINT, SIGTERM
from threading import Thread
from time import sleep
import sys

# Stepper Configuration
PPS=840
EDGE_DELAY=0.5/float(PPS)
## How many steps does it take to advance the roller by 1%
## Set to a negative value to reverse spin
steps_per_pos=192

# Port
PORT=5556

# Pin Configurations
ENA=25
DIR=12
STP=16

# Global Variables
current_stp=0
target_stp=0

enable=DigitalOutputDevice(ENA, False)
direction=DigitalOutputDevice(DIR)
step=DigitalOutputDevice(STP)

# stepperctl
def stepper_controller():
    global current_stp
    global target_stp

    while True:
        sleep(1)
        if current_stp != target_stp:
            enable.on()
            dir = current_stp < target_stp
            if dir:
                direction.on()
            else:
                direction.off()

            while bool(dir) ^ bool(current_stp > target_stp):
                if dir:
                    current_stp += 1
                else:
                    current_stp -= 1

                step.on()
                sleep(EDGE_DELAY)
                step.off()
                sleep(EDGE_DELAY)

            sleep(1)
            enable.off()
            direction.off()

# interrupt handler
def interrupt(signum, frame):
    global target_stp

    target_stp=current_stp
    while target_stp != current_stp:
        sleep(0.001)
    sys.exit("Caught interrupt, safely exiting...")

# HTTP API
app = Flask(__name__)

def to_percent(stp):
    pct = round(stp / steps_per_pos)
    if pct < 0:
        pct += 100
    return pct

@app.route("/state")
def state():
    direction = max(1, min(-1, round((target_stp - current_stp) / steps_per_pos)))

    data = {
        'current_pos': to_percent(current_stp),
        'target_pos': to_percent(target_stp),
        'state': direction
    }
    return jsonify(data), 200

@app.route("/set_pos/<int:pos>", methods = ['PUT'])
def set_pos(pos):
    global target_stp
    if 0 <= pos and pos <= 100:
        target_stp = round(pos * steps_per_pos)
        return "", 200
    return "", 400

if __name__ == '__main__':
    signal(SIGINT, interrupt)
    signal(SIGTERM, interrupt)
    # start stepperctl as a separate daemon thread
    Thread(name = "stepperctl", target = stepper_controller, daemon = True).start()
    app.run(host='0.0.0.0', port=PORT)
