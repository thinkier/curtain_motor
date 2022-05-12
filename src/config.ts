import {AccessoryConfig} from "homebridge";

export interface Config extends AccessoryConfig {
    name: string,
    port: string,
    advanced: {
        steps_per_mm: number,
        actuated_height: number,
        baud_rate: number,
        reverse_direction: boolean
    }
}
