import {
    AccessoryPlugin,
    API,
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
import fetch from "node-fetch";

let hap: HAP;

export = (api: API) => {
    hap = api.hap;
    api.registerAccessory("CurtainMotorPlugin", CurtainMotorPlugin);
};


enum MotorDirection {
    Downwards = -1,
    Stationary = 0,
    Upwards = 1
}

interface StepperState {
    current_pos: number,
    target_pos: number,
    state: MotorDirection
}

class CurtainMotorPlugin implements AccessoryPlugin {
    private readonly name: string;
    private readonly informationService: Service;
    private stepper_state: StepperState = {
        current_pos: 0,
        target_pos: 0,
        state: MotorDirection.Stationary
    };
    private last_state_fetch: number = 0;

    private readonly service: Service;

    constructor(private readonly log: Logging, private readonly config: Config, api: API) {
        this.informationService = new hap.Service.AccessoryInformation()
            .setCharacteristic(hap.Characteristic.Manufacturer, "ACME Pty Ltd");

        setInterval(async () => {
            try {
                this.stepper_state = await fetch(`${config.base_url}/state`).then(x => x.json());
                this.last_state_fetch = Date.now();
            } catch (e) {
                log.error(`Failed to fetch state for curtain motor ${config.name}:`, e);
            }
        }, 2e3);

        this.service = new hap.Service.WindowCovering(this.name);
        this.service.getCharacteristic(hap.Characteristic.CurrentPosition)
            .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
                if (Date.now() - this.last_state_fetch > 10e3) {
                    callback(HAPStatus.OPERATION_TIMED_OUT);
                    return;
                }

                callback(HAPStatus.SUCCESS, Math.round(this.stepper_state.current_pos));
            })
        this.service.getCharacteristic(hap.Characteristic.TargetPosition)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                if (Date.now() - this.last_state_fetch > 10e3) {
                    callback(HAPStatus.OPERATION_TIMED_OUT);
                    return;
                }

                callback(HAPStatus.SUCCESS, this.stepper_state.target_pos);
            })
            .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                try {
                    let http_code = await fetch(`${config.base_url}/set_pos`, {
                        method: "PUT",
                        headers: {content_type: "application/json"},
                        body: JSON.stringify({target_pos: value})
                    }).then(x => x.status);

                    if (http_code === 200) {
                        callback(HAPStatus.SUCCESS);
                    } else {
                        callback(HAPStatus.RESOURCE_BUSY);
                    }
                } catch (e) {
                    callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
                }
            });
        this.service.getCharacteristic(hap.Characteristic.PositionState)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                if (Date.now() - this.last_state_fetch > 10e3) {
                    callback(HAPStatus.OPERATION_TIMED_OUT);
                    return;
                }

                let state = hap.Characteristic.PositionState.STOPPED;
                if (this.stepper_state.state === MotorDirection.Downwards) {
                    state = hap.Characteristic.PositionState.INCREASING;
                } else if (this.stepper_state.state === MotorDirection.Upwards) {
                    state = hap.Characteristic.PositionState.DECREASING;
                }

                callback(HAPStatus.SUCCESS, state);
            });
    }

    getServices = (): Service[] => [
        this.informationService,
        this.service
    ];
}