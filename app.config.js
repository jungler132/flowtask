const fs = require('fs');
const path = require('path');

const appJson = require('./app.json');

const hasGoogleServices = fs.existsSync(path.join(__dirname, 'google-services.json'));

const notificationsPluginConfig = {
  icon: './assets/icon.png',
  color: '#2563eb',
  defaultChannel: 'tasks',
  enableBackgroundRemoteNotifications: true,
  sounds: [],
};

if (hasGoogleServices) {
  notificationsPluginConfig.googleServicesFile = './google-services.json';
}

const plugins = appJson.expo.plugins.map((entry) => {
  if (Array.isArray(entry) && entry[0] === 'expo-notifications') {
    return ['expo-notifications', notificationsPluginConfig];
  }
  return entry;
});

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  ...appJson.expo,
  plugins,
};
