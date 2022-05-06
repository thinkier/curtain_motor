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
    private file_name = "curtain_motor_state.json";
    private readonly state = {height_steps: 0};
    public direction = MotorDirection.Unknown;

    constructor() {
        this.state = JSON.parse(readFileSync(this.file_name, "utf8"));
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
        this.name = config.name;
        this.serial = new SerialPort({
            path: "/dev/ttyACM0",
            baudRate: config.advanced.baud_rate ?? 9600
        });

        this.informationService = new hap.Service.AccessoryInformation()
            .setCharacteristic(hap.Characteristic.Manufacturer, "ACME Pty Ltd");

        log.info(`Initiating Curtain Motor`);


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
            let delta = this.target_pos_steps - this.state.height_steps;

            if (delta > 0) {
                if (this.state.direction != MotorDirection.Backwards) {
                    this.state.direction = MotorDirection.Backwards;
                    this.serial.write("EB");
                }
                this.state.height_steps -= 1;
                this.serial.write("S");
            } else if (delta < 0) {
                if (this.state.direction != MotorDirection.Forwards) {
                    this.state.direction = MotorDirection.Forwards;
                    this.serial.write("EF");
                }
                this.state.height_steps += 1;
                this.serial.write("S");
            } else {
                // Do nothing
            }
            if (Math.abs(delta) <= 1) {
                // Turn off the stepper
                this.serial.write("D");
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