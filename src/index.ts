import {
    AccessoryPlugin,
    API, Characteristic,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    HAP,
    HAPStatus,
    Logging,
    Service
} from "homebridge";
import {Config} from "./config";
import {SerialPort} from "serialport";
import {readFileSync, stat, writeFileSync} from "fs";

let hap: HAP;

export = (api: API) => {
    hap = api.hap;
    api.registerAccessory("CurtainMotorPlugin", CurtainMotorPlugin);
};

const MotorDirection = {
    Unknown: 0,
    Backwards: -1,
    Forwards: 1
}

class CurtainMotorState {
    private file_name = "/homebridge/curtain_motor_state.json";
    private state: Record<string, { height_steps: number }> = {};
    public direction = MotorDirection.Unknown;

    constructor(private readonly name: string) {
        this.refresh();
        this.state[name] = {height_steps: 0};
    }

    private refresh() {
        try {
            this.state = {...JSON.parse(readFileSync(this.file_name, "utf8")), ...this.state};
        } catch (e) {
            // Create the new file silently
        }
    }

    get height_steps() {
        try {
            this.state[this.name] ??= {height_steps: 0};
        } catch (e) {
        }

        return this.state[this.name].height_steps;
    }

    set height_steps(height_steps: number) {
        this.state[this.name].height_steps = height_steps;
        this.refresh();
        writeFileSync(this.file_name, JSON.stringify(this.state));
    }
}

class CurtainMotorPlugin implements AccessoryPlugin {
    private readonly name: string;
    private readonly informationService: Service;
    private readonly serial: SerialPort;
    private state: CurtainMotorState;
    private target_pos_steps: number;

    private readonly service: Service;

    constructor(private readonly log: Logging, private readonly config: Config, api: API) {
        log.info(`Initiating Curtain Motor`);

        this.name = config.name;
        this.state = new CurtainMotorState(this.name);
        this.target_pos_steps = this.state.height_steps;

        this.config.port ??= "/dev/ttyACM0";
        this.config.advanced.actuated_height ??= 1000;
        this.config.advanced.steps_per_mm ??= 6.9;
        this.config.advanced.baud_rate ??= 9600;

        try {
            this.serial = new SerialPort({
                path: this.config.port,
                baudRate: this.config.advanced.baud_rate,
            });
            this.serial.setEncoding("utf8");
            let int = setInterval(() => {
                if (this.serial.read(1) == 'R') {
                    log.info(`Serial port ${this.config.port} is ready.`);
                    clearInterval(int);
                }
                log.debug(`Waiting for serial port ${this.config.port} to come online...`)
            }, 50);
        } catch (err) {
            log.error(`Failed to open ${this.config.port}:`, err);
        }

        this.informationService = new hap.Service.AccessoryInformation()
            .setCharacteristic(hap.Characteristic.Manufacturer, "ACME Pty Ltd");

        this.service = new hap.Service.WindowCovering(this.name);
        this.service.getCharacteristic(hap.Characteristic.CurrentPosition)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(HAPStatus.SUCCESS, this.stepsToPercentage(this.state.height_steps));
            })
        this.service.getCharacteristic(hap.Characteristic.TargetPosition)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(HAPStatus.SUCCESS, this.stepsToPercentage(this.target_pos_steps));
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                this.target_pos_steps = this.percentageToSteps(value as number);

                callback(HAPStatus.SUCCESS);
            });
        this.service.getCharacteristic(hap.Characteristic.PositionState)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                let delta = this.target_pos_steps - this.state.height_steps;
                let state = hap.Characteristic.PositionState.STOPPED;

                if (delta > 0) {
                    state = hap.Characteristic.PositionState.INCREASING;
                } else if (delta < 0) {
                    state = hap.Characteristic.PositionState.DECREASING;
                }
                callback(HAPStatus.SUCCESS, state);
            });

        setInterval(() => {
            let heightSteps = this.state.height_steps;
            let delta = this.target_pos_steps - heightSteps;

            if (delta > 0) {
                if (this.state.direction != MotorDirection.Backwards) {
                    this.state.direction = MotorDirection.Backwards;
                    this.runOnStepper(this.config.advanced.reverse_direction ? "EF" : "EB");
                }
                this.state.height_steps = heightSteps + this.executeSteps(delta);
            } else if (delta < 0) {
                if (this.state.direction != MotorDirection.Forwards) {
                    this.state.direction = MotorDirection.Forwards;
                    this.runOnStepper(this.config.advanced.reverse_direction ? "EB" : "EF");
                }
                this.state.height_steps = heightSteps - this.executeSteps(delta);
            } else if (this.state.direction !== MotorDirection.Unknown) {
                // Turn off the stepper
                this.runOnStepper("D");
                this.state.direction = MotorDirection.Unknown;
            }
        }, 1);

        log.info("Curtain Motor finished initializing!");
    }

    executeSteps(steps: number): number {
        steps = Math.abs(steps);

        let actualNumberOfSteps = 1;

        let v = 9;
        for (let i = 0; i < 10; i++) {
            if ((actualNumberOfSteps << 1) < steps) {
                actualNumberOfSteps <<= 1;
            } else {
                v = i;
                break;
            }
        }

        this.runOnStepper(`S${v}`);

        return actualNumberOfSteps;
    }

    runOnStepper(cmd: string): void {
        this.log.info(`Running on ${this.config.port}:`, cmd);
        this.serial.write(cmd);
        let resp = null;
        while (resp = this.serial.read(cmd.length)) {
            if (resp) return;
        }
    }

    getServices = (): Service[] => [
        this.informationService,
        this.service
    ];

    stepsToPercentage = (steps: number): number => Math.round(steps * 100 / (this.config.advanced.actuated_height * this.config.advanced.steps_per_mm));

    percentageToSteps = (percentage: number): number => (percentage / 100) * (this.config.advanced.actuated_height * this.config.advanced.steps_per_mm);
}