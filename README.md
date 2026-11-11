# Température Maison

Application Android qui affiche la température, l'humidité et la pression de chaque pièce de la maison, ainsi que la météo extérieure. Elle lit les mesures d'une API locale alimentée par des capteurs.

## Fonctionnalités

- Cartes de résumé : moyenne des pièces en température et en humidité, température extérieure.
- Une carte par pièce avec les valeurs actuelles et la pression.
- Historique d'une journée, au choix : navigation jour par jour ou sélecteur de date.
- Graphiques de température et d'humidité. Un appui sur le graphique affiche la valeur et l'heure du point le plus proche.
- Comparaison des 7 derniers jours : une courbe par jour sur le même graphique, un point par heure. Un appui sur une heure donne la valeur de chaque jour.
- Widget Android « Température pièce », au choix de la pièce, actualisé en arrière-plan.
- Thème clair ou sombre selon le système, actualisation automatique toutes les 5 minutes.

## Technologies

Expo (React Native), react-native-chart-kit et react-native-svg pour les graphiques, react-native-android-widget pour le widget.

## Installation

```bash
npm install
cp .env.example .env
npx expo start
```

La variable `EXPO_PUBLIC_OPENWEATHER_URL` du fichier `.env` doit être renseignée (voir `.env.example`).

## Construire l'APK

```bash
npx expo prebuild --platform android --clean
cd android
ANDROID_HOME=~/Android/Sdk bash ./gradlew assembleRelease
```

L'APK est produit dans `android/app/build/outputs/apk/release/app-release.apk`.

## Structure

- `App.js` : écran principal, cartes et graphiques.
- `WeekChart.js` : graphique de comparaison sur 7 jours.
- `api.js` : accès à l'API des capteurs.
- `widgets/` : widget Android et sa tâche d'actualisation.
