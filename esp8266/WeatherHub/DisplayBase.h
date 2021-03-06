#ifndef DisplayBase_H
#define DisplayBase_H

#include <Arduino.h>
#include "SensorOutputData.h"
#include "DisplayConfig.h"
#include "Common.h"

#define DISPLAY_BASE 0
#define DISPLAY_LCD_I2C 1
#define DISPLAY_OLED 2

#define DISPLAY_OLED_ADDRESS 0x3c

class DisplayBase
{
	protected:
		bool printSensorTitle;

	public:
		virtual void setup(DisplayConfig config);
		virtual void clear();
		virtual void printData(SensorOutputData sensorData);
		virtual void printLine(String text, int row);
};

#endif
