
Date.prototype.addHours = function(h) {
    this.setTime(this.getTime() + (h * 60 * 60 * 1000));
    return this;
};

var chartsController = function() {

    var interval = "1 HOUR";
    var queryType = "chart";

    var modules = [];
    var sensors = [];
    var sensorsData = [];
    var weatherData = [];

    var moduleNames = [];
    var moduleDescriptions = [];
    var moduleColors = [];

    var utcDateTimes = [];

    var chartColors = ["#F6A821", "skyblue", "lightgreen", "plum", "salmon", "#226666", "#297B48", "#AAA439", "#403075", "#852C64"];

///////////////////////////////////////////////////////////////////////////////////////////

    function getSensorDataBySensorId(sensorId) {
        for (var i = 0; i < sensorsData.length; i++)
        {
            if (sensorsData[i].SensorID == sensorId)
                return sensorsData[i];
        }

        return null;
    }

    function getSensorBySensorID(sensorId) {
        for (var i = 0; i < sensors.length; i++) {
            if (sensors[i].ID == sensorId)
                return sensors[i];
        }
        return null;
    }

///////////////////////////////////////////////////////////////////////////////////////////

    function getWeatherQueryParams() {
        return {
            getWeather: 1,
            interval: interval,
            queryType: queryType,
            fromChartsPage: 1
        };
    }

    function requestModulesData() {
        queryHelper.requestData({
            getModules: 1,
            getSensors: 1,
            getSensorsData: 1,
            modulesSortBy: "ModuleName"
        }, renderModulesData);
    }

    function requestWeatherData() {
        queryHelper.requestData(getWeatherQueryParams(), renderWeatherData);
    }

///////////////////////////////////////////////////////////////////////////////////////////

    function renderModulesData(payload) {
        modules = payload.modules.data;
        sensorsData = payload.sensorsData.data;
        sensors = payload.sensors.data;

        renderModules();
        renderSensorsData();

        requestWeatherData();
    }

    function getModuleTitle(module) {
        return "{0} (#{1})".format(module.IsAqara ? "Aqara" : module.ModuleName, module.ModuleID);
    }

    function renderModules() {

        var modulesList = ge("modulesList");
        modulesList.innerHTML = "";

        var visibleCount = 0;
        for (var i = 0; i < modules.length; i++) {
            var module = modules[i];
            if (module.IsActive == 1) {
                visibleCount++;
                var title = getModuleTitle(module);
                moduleNames[module.MAC] = title;
                moduleDescriptions[module.MAC] = isStringEmpty(module.Description) ? title : decodeURIComponent(module.Description);
                renderModule(modulesList, module);
            }
        }

        if (visibleCount == 0) {
            createEmptyDataPara(modulesList, "Нет модулей для отображения.");
        }
    }

    function renderModule(modulesList, module) {

        var cbParent = document.createElement("div");
        cbParent.className = "checkbox checkbox-warning";
        modulesList.appendChild(cbParent);

        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "styled";
        cb.checked = module.ChartVisibility == 1;
        cb.setAttribute("data-mac", module.MAC);
        cb.id = "cb_{0}".format(module.MAC);
        cb.onclick = function() {
            var mac = this.getAttribute("data-mac");
            queryHelper.updateModuleData({
                mac: mac,
                chartVisibility: this.checked ? 1 : 0
            }, moduleDataUpdated);
        };
        cbParent.appendChild(cb);

        var label = document.createElement("label");
        var title = moduleNames[module.MAC];
        label.innerHTML = isStringEmpty(module.Description) ? title : (decodeURIComponent(module.Description) + " &ndash; " + title);
        label.htmlFor = cb.id;
        label.title = module.MAC;
        cbParent.appendChild(label);
    }

    function moduleDataUpdated(moduleData) {
        modules = moduleData.data;
        requestWeatherData();
    }

    function validateData(columnName, value) {
        if (columnName == "Temperature1" ||
            columnName == "Temperature2" ||
            columnName == "Temperature3" ||
            columnName == "Temperature4") {
            var valueAsFloat = parseFloat(value);
            return valueAsFloat > -40 && valueAsFloat < 60;
        }

        return true;
    }

    // return array with following data: [datetime in Unix-format, value, MAC of module]
    function prepareData(columnName) {

        var columnData = [];

        for (var i = 0; i < weatherData.length; i++) {
            var dt = utcDateTimes[i];
            var value = weatherData[i][columnName];
            var mac = weatherData[i].ModuleMAC;
            if (value != null && validateData(columnName, value))
                columnData.push([dt, value, mac]);
        }

        return columnData;
    }

    function calculateKalman(values) {
        var result = [];

        // defaults are: R = 1, Q = 1, A = 1, B = 0, C = 1
        var k = new kalman(0.01, 20, 1, 0, 1);

        for (var i = 0; i < values.length; i++) {
            var value = values[i];
            var filteredValue = k.filter(value, 0);
            result.push(filteredValue);
        }

        return result;
    }

    function prepareKalmanData(columnData) {
        var dateTimes = [];
        var values = [];

        var i, dt, value;

        for (i = 0; i < columnData.length; i++) {
            var data = columnData[i];
            dt = data[0];
            value = data[1];

            dateTimes.push(dt);
            values.push(value);
        }

        var kalmanData = [];

        var filteredValues = calculateKalman(values);

        for (i = 0; i < columnData.length; i++) {
            dt = dateTimes[i];
            value = filteredValues[i];

            kalmanData.push([dt, value]);
        }

        return kalmanData;
    }

    function prepareUtcDateTimes(dateColumnName) {
        utcDateTimes = [];

        var now = new Date();
        var currentTimeZoneOffsetInHours = now.getTimezoneOffset() / 60;

        for (var i = 0; i < weatherData.length; i++) {
            var dt = weatherData[i][dateColumnName];
            var localdt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours(), dt.getMinutes(), dt.getSeconds());
            localdt = localdt.addHours(-currentTimeZoneOffsetInHours);
            var utcDatetime = Date.UTC(localdt.getUTCFullYear(), localdt.getUTCMonth(), localdt.getUTCDate(), localdt.getUTCHours(), localdt.getUTCMinutes(), localdt.getUTCSeconds());
            utcDateTimes.push(utcDatetime);
        }
    }

    function mbToMmHg(pressure) {
        if (pressure === null)
            return null;

        return pressure * 0.750064;
    }

    function renderWeatherData(payload) {

        weatherData = payload.weather.data;
        for (var i = 0; i < weatherData.length; i++) {
            weatherData[i].MeasuredDateTime = isIE ? Date.parse(data[i].MeasuredDateTime.replace(" ", "T")) : new Date(weatherData[i].MeasuredDateTime);
            weatherData[i].Pressure1 = mbToMmHg(weatherData[i].Pressure1);
            weatherData[i].Pressure2 = mbToMmHg(weatherData[i].Pressure2);
            weatherData[i].Pressure3 = mbToMmHg(weatherData[i].Pressure3);
            weatherData[i].Pressure4 = mbToMmHg(weatherData[i].Pressure4);
        }

        prepareUtcDateTimes("MeasuredDateTime");

        renderWeatherCharts();
    }

    function getIntervalDescription(interval) {
        var intervalAnchors = $(".intervalItem");
        for (var i = 0; i < intervalAnchors.length; i++) {
            var a = intervalAnchors[i];
            if (a.getAttribute("data-interval") == interval)
                return a.innerHTML;
        }

        return "";
    }

    function renderChartController() {

        var chartController = ge("chartController");
        var intervalSpan = document.createElement("span");
        chartController.appendChild(intervalSpan);

        intervalSpan.id = "intervalSpan";
        intervalSpan.className = "example";
        intervalSpan.innerHTML = "Показывать график за {0}".format(getIntervalDescription(interval));
        intervalSpan.setAttribute("data-jq-dropdown", "#jq-dropdown-2");

        var intervalAnchors = $(".intervalItem");
        intervalAnchors.bind("click", function() {
            var intervalToSet = this.getAttribute("data-interval");
            if (intervalToSet != interval) {
                interval = intervalToSet;
                Cookies.set("chartInterval", interval);
                intervalSpan.innerHTML = "Показывать график за {0}".format(getIntervalDescription(interval));
                requestWeatherData();
            }
        });
    }

    function renderWeatherCharts() {
        for (var i = 0; i < sensors.length; i++) {
            renderSensorChart(sensors[i]);
        }

        console.log("Time until everything loaded: ", Date.now()-timerStart);
    }

    function getModuleMacsToRender(chartData) {
        var macs = [];

        for (var i = 0; i < chartData.length; i++) {
            var mac = chartData[i][2];
            if (ArrayHelper.indexOf(macs, mac) == -1) {
                macs.push(mac);
            }
        }

        return macs;
    }

    function getChartDataByMac(chartData, macToFilter) {
        var filteredData = [];
        for (var i = 0; i < chartData.length; i++) {
            var mac = chartData[i][2];
            if (mac == macToFilter) {
                var dt = chartData[i][0];
                var value = chartData[i][1];

                filteredData.push([dt, value]);
            }
        }
        return filteredData;
    }

    function getSeriesToRender(sensor, chartTitle) {

        var series = [];
        var chartData = prepareData(sensor.SensorName);
        var macs = getModuleMacsToRender(chartData);

        for (var i = 0; i < macs.length; i++) {

            var mac = macs[i];
            var filteredData = getChartDataByMac(chartData, mac);
            var kalmanData = prepareKalmanData(filteredData);
            var colorIndex = i % chartColors.length;

            moduleColors[mac] = colorIndex;

            var serie = {
                yAxis: 0,
                data: kalmanData,
                color: chartColors[colorIndex],
                name: "{0}|{1}".format(chartTitle, moduleDescriptions[mac])
            };
            series.push(serie);
        }

        return series;
    }

    function initHighchartsObject(sensor) {

        var chartContainer = ge("chartContainer_{0}".format(sensor.SensorName));
        var chartTitle = isStringEmpty(sensor.Description) ? sensor.SensorName : sensor.Description;
        var series = getSeriesToRender(sensor, chartTitle);

        var sensorChart = $(chartContainer).highcharts({
            chart: {
                backgroundColor: '#3D3F48',
                type: 'line'
            },
            title: {
                text: chartTitle,
                style: { color: "#c0c4c8" }
            },
            xAxis: {
                type: 'datetime',
                gridLineWidth: 1,
                gridLineColor: '#484c5a',
                tickColor: "#484c5a",
                labels: {
                    style: { color: "#c0c4c8" }
                }
            },
            yAxis: [{
                title: {
                    text: sensor.ChartTitle,
                    style: { color: "#c0c4c8" }
                },
                gridLineWidth: 1,
                gridLineColor: '#484c5a',
                labels: {
                    style: { color: "#c0c4c8" }
                }
            }],
            lang: {
                noData: "Нет данных для отображения"
            },
            noData: {
                style: {
                    fontWeight: 'normal',
                    fontSize: '15px',
                    color: '#c0c4c8'
                }
            },
            tooltip: {
                valueSuffix: " " + sensor.Units,
                formatter: function () {
                    var seriesNames = this.series.name.split("|");
                    var name = "<b>Величина:</b> " + seriesNames[0];
                    var moduleName = "<b>Модуль:</b> " + seriesNames[1];
                    var dt = "<b>Измерено:</b> " + DateFormat.format.date(this.x, "HH:mm:ss dd/MM/yyyy");
                    var value = "<b>Значение:</b> " + this.y.toFixed(2) + " " + sensor.Units;
                    return moduleName + "<br/>" + name + "<br/>" + dt + "<br/>" + value;
                }
            },
            legend: {
                enabled: false
            },
            plotOptions: {
                series: {
                    marker: {
                        radius: 0
                    }
                }
            },
            series: series
        });
    }

    function renderSensorChart(sensor) {
        var widget = ge("sensorWidget_{0}".format(sensor.SensorName));

        var sensorData = getSensorDataBySensorId(sensor.ID);
        var showChart = sensorData != null ? sensorData.ChartVisibility == 1 : false;

        widget.style.display = showChart ? "" : "none";

        if (showChart) {
            initHighchartsObject(sensor);
        }
    }

    function renderSensorChartContainer(chartsContainer, sensor) {
        var col = document.createElement("div");
        col.className = "col-sm-6 col-md-4 sensorWidget";
        col.id = "sensorWidget_{0}".format(sensor.SensorName);
        col.style.display = "none";
        chartsContainer.appendChild(col);

        var thumbnail = document.createElement("div");
        thumbnail.className = "thumbnail";
        col.appendChild(thumbnail);

        var caption = document.createElement("div");
        caption.className = "caption";
        thumbnail.appendChild(caption);

        var chartContainer = document.createElement("div");
        chartContainer.className = "chartContainer";
        chartContainer.id = "chartContainer_{0}".format(sensor.SensorName);
        caption.appendChild(chartContainer);
    }

    function renderSensorsData() {

        var sensorsList = ge("sensorsList");
        sensorsList.innerHTML = "";
        var chartsContainer = ge("chartsContainer");
        chartsContainer.innerHTML = "";

        var visibleCharts = 0;
        for (var i = 0; i < sensors.length; i++) {
            var sensor = sensors[i];

            // render dropdown item
            renderSensor(sensorsList, sensor);
            // render chart thumb
            renderSensorChartContainer(chartsContainer, sensor);

            var sensorData = getSensorDataBySensorId(sensor.ID);
            if (sensorData != null && sensorData.ChartVisibility == 1)
                visibleCharts++;
        }

        if (visibleCharts > 0) {
            ge("jumboMessage").style.display = "none";
        }

        if (sensors.length == 0) {
            createEmptyDataPara(sensorsList, "Нет сенсоров для отображения.");
        }
    }

    function sensorDataUpdated(payload) {

        var oldSensorsState = [];
        for (var i = 0; i < sensorsData.length; i++) {
            var sensorData = sensorsData[i];
            oldSensorsState[sensorData.SensorID] = sensorData;
        }

        // update saved data
        sensorsData = payload.sensorsData.data;

        var visibleCharts = 0;
        for (i = 0; i < sensorsData.length; i++) {
            var sensorData = sensorsData[i];
            var oldSensorState = oldSensorsState[sensorData.SensorID];

            // check if new state differs than old one
            if (oldSensorState == null || sensorData.ChartVisibility != oldSensorState.ChartVisibility) {
                var sensor = getSensorBySensorID(sensorData.SensorID);
                renderSensorChart(sensor);
            }

            if (sensorData.ChartVisibility == 1)
                visibleCharts++;
        }

        ge("jumboMessage").style.display = (visibleCharts > 0) ? "none" : "";
    }

    function renderSensor(sensorsList, sensor) {

        var cbParent = document.createElement("div");
        cbParent.className = "checkbox checkbox-warning";
        sensorsList.appendChild(cbParent);

        var sensorData = getSensorDataBySensorId(sensor.ID);
        var chartVisibility = sensorData != null ? sensorData.ChartVisibility == 1 : false;

        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "styled";
        cb.checked = chartVisibility;
        cb.setAttribute("sensorid", sensor.ID);
        cb.id = "cb_{0}".format(sensor.ID);
        cb.onclick = function() {
            var sensorId = parseInt(this.getAttribute("sensorid"));
            queryHelper.updateSensorData({
                sensorId: sensorId,
                chartVisibility: this.checked ? 1 : 0
            }, sensorDataUpdated);
        };
        cbParent.appendChild(cb);

        var label = document.createElement("label");
        label.innerHTML = sensor.Description;
        label.htmlFor = cb.id;
        cbParent.appendChild(label);
    }

    function createEmptyDataPara(parent, text) {
        var emptyPara = document.createElement("p");
        emptyPara.className = "orange";
        emptyPara.innerHTML = text;
        parent.appendChild(emptyPara);
    }

    function setupSettings() {
        var chartInterval = Cookies.get("chartInterval");
        if (chartInterval != null) {
            interval = chartInterval;
        }
    }

    function init() {
        setupSettings();
        renderChartController();
        requestModulesData();
    }

    init();
};
