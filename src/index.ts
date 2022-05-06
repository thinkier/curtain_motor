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
    private readonly state = {height_steps: 0};
    public direction = MotorDirection.Unknown;

    constructor() {
        try {
            this.state = JSON.parse(readFileSync(this.file_name, "utf8"));
        } catch (e) {
        }
    }

    get height_steps() {
        return this.state.height_steps;
    }

    set height_steps(height_steps: number) {
        this.state.height_steps = height_steps;
        writeFileSync(this.file_name, JSON.stringify(this.state));
    }
}

class CurtainMotorPlugin implements AccessoryPlugin {
    private readonly name: string;
    private readonly informationService: Service;
    private readonly serial: SerialPort;
    private state: CurtainMotorState = new CurtainMotorState();
    private target_pos_steps: number = this.state.height_steps;

    private readonly service: Service;

    constructor(private readonly log: Logging, private readonly config: Config, api: API) {
        log.info(`Initiating Curtain Motor`);

        this.name = config.name;
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

            log.info(`Connected to ${this.config.port}`);
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

        // The stepper motor is capped at 1000pps due to the runner here
        setInterval(() => {
            let heightSteps = this.state.height_steps;
            let delta = this.target_pos_steps - heightSteps;

            if (delta > 0) {
                if (this.state.direction != MotorDirection.Backwards) {
                    this.state.direction = MotorDirection.Backwards;
                    this.serial.write(this.config.advanced.reverse_direction ? "EF" : "EB");
                    this.serial.read(2);
                }
                this.serial.write("S");
                this.serial.read(1);
                this.state.height_steps = heightSteps + 1;
            } else if (delta < 0) {
                if (this.state.direction != MotorDirection.Forwards) {
                    this.state.direction = MotorDirection.Forwards;
                    this.serial.write(this.config.advanced.reverse_direction ? "EB" : "EF");
                    this.serial.read(2);
                }
                this.serial.write("S");
                this.serial.read(1);
                this.state.height_steps = heightSteps - 1;
            } else if (this.state.direction !== MotorDirection.Unknown) {
                // Turn off the stepper
                this.serial.write("D");
                this.serial.read(1);
                this.state.direction = MotorDirection.Unknown;
            }
        }, 1);

        log.info("Curtain Motor finished initializing!");
    }

    getServices(): Service[] {
        return [
            this.informationService,
            this.service
        ];
    }

    stepsToPercentage(steps: number): number {
        return Math.round(steps * 100 / (this.config.advanced.actuated_height * this.config.advanced.steps_per_mm))
    }

    percentageToSteps(percentage: number): number {
        return (percentage / 100) * (this.config.advanced.actuated_height * this.config.advanced.steps_per_mm);
    }
}