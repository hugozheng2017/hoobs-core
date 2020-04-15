/**************************************************************************************************
 * hoobs-core / homebridge                                                                        *
 * Copyright (C) 2020 Homebridge                                                                  *
 * Copyright (C) 2020 HOOBS                                                                       *
 *                                                                                                *
 * This program is free software: you can redistribute it and/or modify                           *
 * it under the terms of the GNU General Public License as published by                           *
 * the Free Software Foundation, either version 3 of the License, or                              *
 * (at your option) any later version.                                                            *
 *                                                                                                *
 * This program is distributed in the hope that it will be useful,                                *
 * but WITHOUT ANY WARRANTY; without even the implied warranty of                                 *
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the                                  *
 * GNU General Public License for more details.                                                   *
 *                                                                                                *
 * You should have received a copy of the GNU General Public License                              *
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.                          *
 **************************************************************************************************/

const uuid = require("hap-nodejs").uuid;
const Accessory = require("hap-nodejs").Accessory;
const Service = require("hap-nodejs").Service;
const Characteristic = require("hap-nodejs").Characteristic;
const inherits = require("util").inherits;
const EventEmitter = require("events").EventEmitter;

module.exports = {
    PlatformAccessory: PlatformAccessory
}

function PlatformAccessory(displayName, UUID, category) {
    if (!displayName) {
        throw new Error("Accessories must be created with a non-empty displayName.");
    }

    if (!UUID) {
        throw new Error("Accessories must be created with a valid UUID.");
    }

    if (!uuid.isValid(UUID)) {
        throw new Error(`UUID "${UUID}" is not a valid UUID.`);
    }

    this.displayName = displayName;
    this.UUID = UUID;
    this.category = category || Accessory.Categories.OTHER;
    this.services = [];
    this.reachable = false;
    this.context = {};

    this._associatedPlugin;
    this._associatedPlatform;
    this._associatedHAPAccessory;

    this.addService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Name, displayName)
        .setCharacteristic(Characteristic.Manufacturer, "Default-Manufacturer")
        .setCharacteristic(Characteristic.Model, "Default-Model")
        .setCharacteristic(Characteristic.SerialNumber, "Default-SerialNumber");
}

inherits(PlatformAccessory, EventEmitter);

PlatformAccessory.prototype.addService = function (service) {
    if (typeof service === "function") {
        service = new (Function.prototype.bind.apply(service, arguments));
    }

    for (let index in this.services) {
        const existing = this.services[index];

        if (existing.UUID === service.UUID) {
            if (!service.subtype) {
                throw new Error(`Cannot add a Service with the same UUID "${existing.UUID}" as another Service in this Accessory without also defining a unique "subtype" property.`);
            }

            if (service.subtype.toString() === existing.subtype.toString()) {
                throw new Error(`Cannot add a Service with the same UUID "${existing.UUID}" and subtype "${existing.subtype}" as another Service in this Accessory.`);
            }
        }
    }

    this.services.push(service);

    if (this._associatedHAPAccessory) {
        this._associatedHAPAccessory.addService(service);
    }

    return service;
}

PlatformAccessory.prototype.removeService = function (service) {
    let targetServiceIndex;

    for (let index in this.services) {
        if (this.services[index] === service) {
            targetServiceIndex = index;

            break;
        }
    }

    if (targetServiceIndex) {
        this.services.splice(targetServiceIndex, 1);

        service.removeAllListeners();

        if (this._associatedHAPAccessory) {
            this._associatedHAPAccessory.removeService(service);
        }
    }
}

PlatformAccessory.prototype.getService = function (name) {
    for (let index in this.services) {
        const service = this.services[index];

        if (typeof name === "string" && (service.displayName === name || service.name === name)) {
            return service;
        } else if (typeof name === "function" && ((service instanceof name) || (name.UUID === service.UUID))) {
            return service;
        }
    }
}

PlatformAccessory.prototype.getServiceByUUIDAndSubType = function (UUID, subtype) {
    for (let index in this.services) {
        const service = this.services[index];

        if (typeof UUID === "string" && (service.displayName === UUID || service.name === UUID) && service.subtype === subtype) {
            return service;
        } else if (typeof UUID === "function" && ((service instanceof UUID) || (UUID.UUID === service.UUID)) && service.subtype === subtype) {
            return service;
        }
    }
}

PlatformAccessory.prototype.updateReachability = function (reachable) {
    this.reachable = reachable;

    if (this._associatedHAPAccessory) {
        this._associatedHAPAccessory.updateReachability(reachable);
    }
}

PlatformAccessory.prototype.configureCameraSource = function (cameraSource) {
    this.cameraSource = cameraSource;

    for (let index in cameraSource.services) {
        this.addService(cameraSource.services[index]);
    }
}

PlatformAccessory.prototype._prepareAssociatedHAPAccessory = function () {
    this._associatedHAPAccessory = new Accessory(this.displayName, this.UUID);

    if (this.cameraSource) {
        this._associatedHAPAccessory.configureCameraSource(this.cameraSource);
    }

    this._associatedHAPAccessory._sideloadServices(this.services);
    this._associatedHAPAccessory.category = this.category;
    this._associatedHAPAccessory.reachable = this.reachable;

    this._associatedHAPAccessory.on("identify", function (paired, callback) {
        if (this.listeners("identify").length > 0) {
            this.emit("identify", paired, callback);

            process.send({ event: "identify", data: paired });
        } else {
            callback();
        }
    }.bind(this));
}

PlatformAccessory.prototype._dictionaryPresentation = function () {
    const accessory = {};

    accessory.plugin = this._associatedPlugin;
    accessory.platform = this._associatedPlatform;
    accessory.displayName = this.displayName;
    accessory.UUID = this.UUID;
    accessory.category = this.category;
    accessory.context = this.context;

    const services = [];
    const linkedServices = {};

    for (let index in this.services) {
        const service = this.services[index];
        const servicePresentation = {};

        servicePresentation.displayName = service.displayName;
        servicePresentation.UUID = service.UUID;
        servicePresentation.subtype = service.subtype;

        const linkedServicesPresentation = [];

        for (let linkedServiceIdx in service.linkedServices) {
            linkedServicesPresentation.push(service.linkedServices[linkedServiceIdx].UUID + (linkedServices.subtype || ""));
        }

        linkedServices[service.UUID + (service.subtype || "")] = linkedServicesPresentation;

        const characteristics = [];

        for (let cIndex in service.characteristics) {
            const characteristic = service.characteristics[cIndex];
            const characteristicPresentation = {};

            characteristicPresentation.displayName = characteristic.displayName;
            characteristicPresentation.UUID = characteristic.UUID;
            characteristicPresentation.props = characteristic.props;
            characteristicPresentation.value = characteristic.value;
            characteristicPresentation.eventOnlyCharacteristic = characteristic.eventOnlyCharacteristic;

            characteristics.push(characteristicPresentation);
        }

        servicePresentation.characteristics = characteristics;

        services.push(servicePresentation);
    }

    accessory.linkedServices = linkedServices;
    accessory.services = services;

    return accessory;
}

PlatformAccessory.prototype._configFromData = function (data) {
    this._associatedPlugin = data.plugin;
    this._associatedPlatform = data.platform;
    this.displayName = data.displayName;
    this.UUID = data.UUID;
    this.category = data.category;
    this.context = data.context;
    this.reachable = false;

    const services = [];
    const servicesMap = {};

    for (let index in data.services) {
        const service = data.services[index];
        const hapService = new Service(service.displayName, service.UUID, service.subtype);
        const characteristics = [];

        for (let cIndex in service.characteristics) {
            const characteristic = service.characteristics[cIndex];
            const hapCharacteristic = new Characteristic(characteristic.displayName, characteristic.UUID, characteristic.props);

            hapCharacteristic.eventOnlyCharacteristic = characteristic.eventOnlyCharacteristic;
            hapCharacteristic.value = characteristic.value;

            characteristics.push(hapCharacteristic);
        }

        hapService._sideloadCharacteristics(characteristics);

        servicesMap[service.UUID + (service.subtype || "")] = hapService;

        services.push(hapService);
    }

    if (data.linkedServices) {
        const linkedServices = data.linkedServices;

        for (let key in linkedServices) {
            if (servicesMap[key]) {
                const linkedServiceKeys = linkedServices[key];

                for (let linkedServiceKey in linkedServiceKeys) {
                    if (servicesMap[linkedServiceKeys[linkedServiceKey]]) {
                        servicesMap[key].addLinkedService(servicesMap[linkedServiceKeys[linkedServiceKey]]);
                    }
                }
            }
        }
    }

    this.services = services;
}