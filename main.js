const bleServiceGuid = '19b10000-e8f2-537e-4f6c-d104768a1214';
const temperatureSensorCharacteristicGuid = '19b10001-e8f2-537e-4f6c-d104768a1214';
const heatingToggleCharacteristicGuid = '19b10002-e8f2-537e-4f6c-d104768a1214';
const heatingPowerOutputCharacteristicGuid = '19b10004-e8f2-537e-4f6c-d104768a1214'
const powerDropCharacteristicGuid = '19b10003-e8f2-537e-4f6c-d104768a1214';

const connectedDeviceTemplate = document.getElementById('connectedDeviceTemplate');
const devicesContainerElement = document.getElementById("connectedDevicesContainer")

const gaugeStartTemperature = 30;
const gaugeEndTemperature = 90;
const initialTargetTemperature = 65; 

const addNewDeviceButton = document.getElementById("addNewDeviceButton");
addNewDeviceButton.addEventListener("click", tryAddNewDevice);

const syncSettingsButton = document.getElementById("syncDevicesSettingsButton");

syncSettingsButton.addEventListener("click", trySyncDevicesSettings)

let connectedDevicesList = [];

function tryAddNewDevice() {
    if (!isWebBluetoothEnabled()) {
        return null;
    }

    return connectToDevice();
}

function isWebBluetoothEnabled() {
    if (!navigator.bluetooth) {
        console.log('Web Bluetooth API is not available in this browser!');
        return false
    }
    console.log('Web Bluetooth API supported in this browser.');
    return true
}

async function connectToDevice() {
    console.log('Initializing Bluetooth...');
    navigator.bluetooth.requestDevice({
        acceptAllDevices: false,
        filters:
            [
                {namePrefix: "Thermo"}
                // {services: [bleServiceGuid]}
            ],
        optionalServices: [bleServiceGuid]
    })
        .then(device => {
            console.log('Device Selected:', device.name);
            return addConnectedDevice(device);
        })
        .then(connectedDevice => {
            connectedDevice.deviceConnectionIcon.classList.add('device-link-icon-connecting');
            return connectedDevice;
        })
        .then(async connectedDevice => {
            connectedDevice.gattServer = await connectedDevice.device.gatt.connect();
            console.log("Connected to GATT Server");

            connectedDevice.device.addEventListener('gattserverdisconnected', () => onDisconnected(connectedDevice));
            return connectedDevice;
        })
        .then(async connectedDevice => {
            connectedDevice.service = await connectedDevice.gattServer.getPrimaryService(bleServiceGuid);
            console.log("Service discovered:", connectedDevice.service);
            return connectedDevice;
        })
        .then(async connectedDevice => {
            connectDeviceInfoPanel(connectedDevice);
            await Promise.all
            ([
                connectTemperatureSensorCharacteristic(connectedDevice),
                connectHeatingToggleCharacteristic(connectedDevice),
                connectHeatingPowerOutputCharacteristic(connectedDevice),
                connectPowerDropCharacteristic(connectedDevice),
            ]);
            return connectedDevice;
        })
        .then(connectedDevice => {
            connectedDevice.deviceConnectionIcon.classList.remove('device-link-icon-connecting');
            return connectedDevice;
        })
        .catch(error => {
            console.log('Error: ', error);
        });
}


async function addConnectedDevice(device) {
    const newItem = document.importNode(connectedDeviceTemplate.content, true);
    let result = {
        device: device,
        isDisconnectRequested: false,
        isSettingTemperature: false,
        domRoots: Array.from(newItem.childNodes),
        deviceNameField: newItem.querySelector('#deviceNameField'),
        deviceConnectionIcon: newItem.querySelector('#deviceConnectionIcon'),
        temperatureTicksParent: newItem.querySelector('#temperatureTicksParent'),
        temperatureHandle: newItem.querySelector('#temperatureHandle'),
        temperatureSlider: newItem.querySelector('#temperatureSlider'),
        deviceRemoveButton: newItem.querySelector('#deviceRemoveButton'),
        currentTemperatureField: newItem.querySelector('#currentTemperatureField'),
        currentPowerOutputField: newItem.querySelector('#currentPowerOutputField'),
        heatingToggle: newItem.querySelector('#heatingToggle'),
    }
    addTemperatureTicks(result);
    addHandleProcessing(result);
    devicesContainerElement.appendChild(newItem);
    connectedDevicesList.push(result);
    return result;
}

function addTemperatureTicks(device) {
    const tickGroup = device.temperatureTicksParent;
    const centerX = 100;
    const centerY = 100;
    const outerRadius = 98;
    const innerRadius = 82;
    const labelRadius = 110;
    const textOffsetX = 0;
    const textOffsetY = 4;

    for (let i = gaugeStartTemperature; i <= gaugeEndTemperature; i += 10) {
        const angle = ((i - gaugeStartTemperature) / (gaugeEndTemperature - gaugeStartTemperature)) * Math.PI;
        const x1 = centerX + innerRadius * Math.cos(Math.PI - angle);
        const y1 = centerY - innerRadius * Math.sin(Math.PI - angle);
        const x2 = centerX + outerRadius * Math.cos(Math.PI - angle);
        const y2 = centerY - outerRadius * Math.sin(Math.PI - angle);

        const lx = centerX + labelRadius * Math.cos(Math.PI - angle);
        const ly = centerY - labelRadius * Math.sin(Math.PI - angle);

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1.toString());
        line.setAttribute("y1", y1.toString());
        line.setAttribute("x2", x2.toString());
        line.setAttribute("y2", y2.toString());
        line.classList.add("gauge-tick");
        tickGroup.appendChild(line);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", (lx + textOffsetX).toString());
        text.setAttribute("y", (ly + textOffsetY).toString());
        text.textContent = `${i}°`;
        text.classList.add("gauge-tick-text");
        tickGroup.appendChild(text);
    }
}

function addHandleProcessing(connectedDevice) {
    const svg = connectedDevice.temperatureHandle.closest('svg');
    
    connectedDevice.temperatureHandle.addEventListener('pointerdown', e => {
        e.preventDefault();
        svg.setPointerCapture(e.pointerId); // moved to svg for broader capture
        connectedDevice.isSettingTemperature = true;

        let pointerMoveHandler = e => {
            const temp = readHandleRotationTemperature(svg, e.clientX, e.clientY);
            updateTargetTemperatureSlider(connectedDevice, temp);
            setTemperatureView(connectedDevice, temp);
        };
        svg.addEventListener('pointermove', pointerMoveHandler);

        svg.addEventListener('pointerup', function pointerUpHandler(ev) {
            svg.releasePointerCapture(ev.pointerId);
            svg.removeEventListener('pointermove', pointerMoveHandler);
            svg.removeEventListener('pointerup', pointerUpHandler);

            const temp = readHandleRotationTemperature(svg, ev.clientX, ev.clientY);
            setPowerDropTemperatures(connectedDevice, temp);
            connectedDevice.isSettingTemperature = false;
        });
    });
}

function readHandleRotationTemperature(svgRect, x, y){
    const rect = svgRect.getBoundingClientRect();
    const cx = rect.left + 100;
    const cy = rect.top + 100;
    const dx = x - cx;
    const dy = y - cy;
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    angle = angle + 180;
    angle = Math.max(0, Math.min(180, angle));
    const percent = angle / 180;
    return  Math.round(gaugeStartTemperature + (gaugeEndTemperature - gaugeStartTemperature) * percent);
}

function connectDeviceInfoPanel(connectedDevice) {
    connectedDevice.deviceNameField.innerHTML = connectedDevice.device.name;
    connectedDevice.deviceRemoveButton.addEventListener("click", () => disconnectDevice(connectedDevice));
}

async function connectTemperatureSensorCharacteristic(connectedDevice) {
    const characteristic = await connectedDevice.service.getCharacteristic(temperatureSensorCharacteristicGuid);
    console.log("Characteristic discovered:", characteristic.uuid);
    connectedDevice.temperatureSensorCharacteristic = characteristic;
    characteristic.addEventListener('characteristicvaluechanged', event => updateTemperatureSensorValue(connectedDevice, event.target.value));
    await characteristic.startNotifications();
}

function updateTemperatureSensorValue(connectedDevice, value) {
    const receivedValue = new TextDecoder().decode(value);
    const roundedValue = Math.round(Number(receivedValue));
    if (!connectedDevice.isSettingTemperature){
        setTemperatureView(connectedDevice, roundedValue);  
    }
}

function setTemperatureView(connectedDevice, value){
    connectedDevice.currentTemperatureField.innerHTML = value.toString();
}

async function connectHeatingToggleCharacteristic(connectedDevice) {
    const characteristic = await connectedDevice.service.getCharacteristic(heatingToggleCharacteristicGuid);
    console.log("Characteristic discovered:", characteristic.uuid);

    connectedDevice.heatingToggleCharacteristic = characteristic;
    connectedDevice.heatingToggle.addEventListener("change", () => tryChangeHeatingToggleState(connectedDevice));
    // connectedDevice.heatingSwitchButtonOff.addEventListener("click", () => setHeatingToggleState(connectedDevice, false));

    characteristic.addEventListener('characteristicvaluechanged', event => handleHeatingToggleStateUpdate(connectedDevice, event.target.value));
    await characteristic.startNotifications();

    const currentValue = await characteristic.readValue();
    handleHeatingToggleStateUpdate(connectedDevice, currentValue);
}

function handleHeatingToggleStateUpdate(connectedDevice, value) {
    const data = new TextDecoder().decode(value);
    const isOn = data === "on";
    connectedDevice.heatingToggle.checked = isOn;
}

function tryChangeHeatingToggleState(connectedDevice) {
    const isOn = connectedDevice.heatingToggle.checked;
    const data = new TextEncoder().encode(isOn ? "on" : "off");
    return connectedDevice.heatingToggleCharacteristic.writeValue(data);
}

async function connectHeatingPowerOutputCharacteristic(connectedDevice) {
    const characteristic = await connectedDevice.service.getCharacteristic(heatingPowerOutputCharacteristicGuid);
    console.log("Characteristic discovered:", characteristic.uuid);
    connectedDevice.heatingPowerOutputCharacteristic = characteristic;

    characteristic.addEventListener('characteristicvaluechanged', event => updateHeatingPowerOutputValue(connectedDevice, event.target.value));
    await characteristic.startNotifications();

    const currentValue = await characteristic.readValue();
    updateHeatingPowerOutputValue(connectedDevice, currentValue);
}

function updateHeatingPowerOutputValue(connectedDevice, value) {
    const data = new TextDecoder().decode(value);
    const number = Math.round(Number(data) * 100 * 10) / 10;
    connectedDevice.currentPowerOutputField.innerHTML = number + "%";
}

async function connectPowerDropCharacteristic(connectedDevice) {
    const characteristic = await connectedDevice.service.getCharacteristic(powerDropCharacteristicGuid);
    console.log("Characteristic discovered:", characteristic.uuid);
    connectedDevice.powerDropCharacteristic = characteristic;

    characteristic.addEventListener('characteristicvaluechanged', event => updatePowerDropTemperatures(connectedDevice, event.target.value));
    await characteristic.startNotifications();

    const currentValue = await characteristic.readValue();
    updatePowerDropTemperatures(connectedDevice, currentValue);
    setPowerDropTemperatures(connectedDevice, initialTargetTemperature);
}

function updatePowerDropTemperatures(connectedDevice, value) {
    const decodedValue = new TextDecoder().decode(value);
    const values = decodedValue.split(";");
    const targetTemperature = (Number(values[0]) + Number(values[1]))/2;
    updateTargetTemperatureSlider(connectedDevice, targetTemperature)
}

function updateTargetTemperatureSlider(connectedDevice, value) {
    const percent = ((value - gaugeStartTemperature) / (gaugeEndTemperature - gaugeStartTemperature));
    const angle = percent * 180;
    const handleAngleOffset = -90;
    connectedDevice.temperatureHandle.style.transform = `rotate(${angle + handleAngleOffset}deg)`;
    
    const totalArcLength = 283; // This should match the stroke-dasharray
    const dashoffset = totalArcLength * (1 - percent);
    connectedDevice.temperatureSlider.style.strokeDashoffset = dashoffset.toString();
}

function setPowerDropTemperatures(connectedDevice, temp) {
    const dropStart = temp - 0.5;
    const dropEnd = temp + 0.5;
    const dataString = dropStart + ";" + dropEnd;
    const data = new TextEncoder().encode(dataString);
    return connectedDevice.powerDropCharacteristic.writeValue(data)
}

function trySyncDevicesSettings() {
    // todo
}

async function disconnectDevice(connectedDevice) {
    console.log("Disconnecting: ", connectedDevice.device.id);
    connectedDevice.isDisconnectRequested = true;
    if (connectedDevice.gattServer && connectedDevice.gattServer.connected) {
        await connectedDevice.temperatureSensorCharacteristic.stopNotifications();
        await connectedDevice.heatingToggleCharacteristic.stopNotifications();
        await connectedDevice.powerDropCharacteristic.stopNotifications();
        await connectedDevice.heatingPowerOutputCharacteristic.stopNotifications()
        console.log("Notifications from device stopped: ", connectedDevice.device.id)
    }

    unregisterConnectedDevice(connectedDevice);
    deleteConnectedDeviceView(connectedDevice);
}

function unregisterConnectedDevice(connectedDevice) {
    const index = connectedDevicesList.indexOf(connectedDevice);
    connectedDevicesList.splice(index, 1);
}

function deleteConnectedDeviceView(connectedDevice) {
    connectedDevice.domRoots.forEach(root => {
            if (devicesContainerElement.contains(root)) {
                devicesContainerElement.removeChild(root);
            }
        }
    );
}

function onDisconnected(connectedDevice) {
    connectedDevice.deviceConnectionIcon.classList.add('device-link-icon-lost')
    if (connectedDevice.isDisconnectRequested){
        return;
    } 
    console.log(`Device ${connectedDevice.device.name} disconnected. Attempting to reconnect...`);
    attemptReconnect(connectedDevice);
}

async function attemptReconnect(connectedDevice) {
    let attempt = 0;
    const delay = 2000;
    
    while (!connectedDevice.isDisconnectRequested){
        try {
            console.log(`Reconnection attempt ${attempt + 1} for device: ${connectedDevice.device.name}`);
            connectedDevice.gattServer = await connectedDevice.device.gatt.connect();
            console.log(`Reconnected successfully to device's gatt: ${connectedDevice.device.name}`);
            connectedDevice.service = await connectedDevice.gattServer.getPrimaryService(bleServiceGuid);
            await Promise.all
            ([
                connectTemperatureSensorCharacteristic(connectedDevice),
                connectHeatingToggleCharacteristic(connectedDevice),
                connectHeatingPowerOutputCharacteristic(connectedDevice),
                connectPowerDropCharacteristic(connectedDevice)
            ]);

            connectedDevice.deviceConnectionIcon.classList.remove('device-link-icon-lost');
            connectedDevice.isDisconnectRequested = false;
            return;
        }
        catch (error) {
            console.log(`Reconnection attempt ${attempt + 1} failed: `, error);
            attempt++;
            await new Promise(resolve => setTimeout(resolve, delay)); // Wait before retrying
        }
    }
}