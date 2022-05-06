import {AccessoryConfig} from "homebridge";

export interface Config extends AccessoryConfig {
    port: string,
    advanced: {
        steps_per_mm: number,
        actuated_height: number,
        baud_rate: number
    }
}
