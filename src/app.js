require('dotenv').config()
const moment = require('moment');
const cron = require('node-cron');
const axios = require('axios');
const appConfig = require('./config/appConfig');
const schedulerConfig = require('./config/schedulerConfig');
const alerts = require('./services/alerts');
const routes = require('./api/routes');
const locations = require('./utilities/locations');
const appointments = require('./utilities/appointments');
const htmlBuilder = require('./utilities/htmlBuilder');

async function main() {
  try {
    await fetchVaccinationSlots();
    // cron.schedule(schedulerConfig.SCHEDULE, async () => {
      // await fetchVaccineSlots();
    // });
  } catch (e) {
    console.log('There was an error fetching vaccine slots: ' + JSON.stringify(e, null, 2));
    throw e;
  }
}

async function fetchVaccinationSlots() {
  let dates = await getTwoWeekDateArray();
  try {
    if (Boolean(appConfig.FINDBYPINCODE)) {
      if (appConfig.PINCODE.toString().length < 6) {
        throw 'Application is set to fetch vaccine slots by pincode but no pincode/ invalid pincode provided in config file: (src/config/appConfig.js)';
      }
      getAppointmentsByPincode(dates);
    } else {
      if (appConfig.DISTRICT.length == 0) {
        throw 'Application is set to fetch vaccine slots by district but no district name provided in config file: (src/config/appConfig.js)';
      }
      getAppointmentsByDistrict(dates);
    }
  } catch (e) {
    console.log(e);
  }
}

async function getAppointmentsByPincode(dates) {
  let slotsArray = [];
  for await (const date of dates) {
    let slots = await routes.getVaccinationSlotsByPincode(appConfig.PINCODE, date)
      .then(function (result) {
        return appointments.getFilteredSlots(date, result.data.sessions);
      })
      .catch(function (error) {
        console.log('Unable to get appointment slots at pincode: ' + appConfig.PINCODE + ' for the date: ' + date + ', ' + error.response.statusText);
      });
    slotsArray.push(slots);
  };
  sendEmailAlert(slotsArray);
}

async function getAppointmentsByDistrict(dates) {
  let slotsArray = [];
  try {
    let stateId = await locations.getStateId(appConfig.STATE);
    let districtId = await locations.getDistrictId(stateId, appConfig.DISTRICT);
    if (stateId == undefined) {
      throw 'Unable to find state id. Please verify state name in config file: src/config/appConfig.js';
    } else if (districtId == undefined) {
      throw 'Unable to find district id. Please verify district name in config file: src/config/appConfig.js';
    }
    for await (const date of dates) {
      let slots = await routes.getVaccinationSlotsByDistrict(districtId, date)
        .then(function (result) {
          return appointments.getFilteredSlots(date, result.data.sessions);
        })
        .catch(function (error) {
          console.log('Unable to get appointment slots at district: ' + districtId + ' for the date: ' + date + ', ' + error.response.statusText);
        });
      slotsArray.push(slots);
    };
    sendEmailAlert(slotsArray);
  } catch (e) {
    console.log(e);
  }
}

async function getTwoWeekDateArray() {
  let dateArray = [];
  let currentDate = moment();
  for(let counter = 0; counter < 1; counter++) {
    let date = currentDate.format(schedulerConfig.DATE_FORMAT);
    dateArray.push(date);
    currentDate.add(1, 'day');
  }
  return dateArray;
}

async function sendEmailAlert(slotsArray) {
  let outputArray = [];
  if (slotsArray[0] == undefined) {
    console.log('No sessions to process at this time');
  } else {
    for(let counter1 = 0; counter1 < slotsArray.length; counter1++) {
      for(let counter2 = 0; counter2 < slotsArray[counter1].length; counter2++) {
        outputArray.push(slotsArray[counter1][counter2]);
      }
    }
    let htmlBody = await htmlBuilder.prepareHtmlBody(outputArray);
    alerts.sendEmailAlert(htmlBody, (err, result) => {
      if(err) {
        console.error({err});
      }
    })
  }
};

main().then(() => {
  console.log('The covid-19 vaccine alerting application has started!');
});
