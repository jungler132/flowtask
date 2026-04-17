import 'react-native-gesture-handler';
import { enableScreens } from 'react-native-screens';

// Без нативных RNSScreen на Android (иначе Fabric ломается: String→Boolean).
enableScreens(false);

import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
