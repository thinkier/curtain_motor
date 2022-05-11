import {AccessoryConfig} from "homebridge";

export interface Config extends AccessoryConfig {
    name: string,
    base_url: string,
}
