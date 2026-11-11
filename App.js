import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    useColorScheme,
    Platform,
    ActivityIndicator,
    Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from 'expo-status-bar';
import Animated, { useAnimatedProps, useDerivedValue } from 'react-native-reanimated';
import { LineChart } from 'react-native-chart-kit';
import { G, Line, Circle } from 'react-native-svg';
import * as Network from 'expo-network';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './widgets/tachePieceWidget.js';

import { fetchData, fetchWeek, getURL } from './api.js';
import WeekChart from './WeekChart.js';
/*
  ---------------------------------------------------------------------------
  Station météo — version React Native / Expo (fichier unique)
  ---------------------------------------------------------------------------
  Dépendances à installer dans le projet Expo :

    npx expo install react-native-svg
    npm install react-native-chart-kit
    npx expo install @react-native-community/datetimepicker

  Ce fichier peut être utilisé tel quel comme App.js d'un projet Expo vierge
  (npx create-expo-app puis remplacer App.js par ce fichier).
  ---------------------------------------------------------------------------
*/

// ---------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------

const OPENWEATHER_URL = process.env.EXPO_PUBLIC_OPENWEATHER_URL;
const REFRESH_MS = 5 * 60000; // auto-actualisation toutes les 5 min
// ---------------------------------------------------------------
// PALETTES DE COULEURS (clair / sombre)
// ---------------------------------------------------------------
const PALETTES = {
    light: {
        bg: '#EEF1F0',
        surface: '#FFFFFF',
        surface2: '#F5F7F6',
        ink: '#16201D',
        muted: '#5B6B65',
        line: '#D9E0DD',
        temp: '#C24E22',
        hum: '#1E7A8C',
        good: '#2E8B57',
        warn: '#C79A1E',
    },
    dark: {
        bg: '#0D1210',
        surface: '#161F1C',
        surface2: '#1B2521',
        ink: '#E7EDE9',
        muted: '#8CA098',
        line: '#28332F',
        temp: '#F0824A',
        hum: '#54C6DA',
        good: '#4FBE85',
        warn: '#E0B84C',
    },
};

// ---------------------------------------------------------------
// UTILITAIRES DATE
// ---------------------------------------------------------------
function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function isSameDay(a, b) {
    return a.toDateString() === b.toDateString();
}

function formatDateLabel(d) {
    const today = startOfDay(new Date());
    if (isSameDay(d, today)) return "Aujourd'hui";
    const hier = new Date(today);
    hier.setDate(hier.getDate() - 1);
    if (isSameDay(d, hier)) return 'Hier';
    return d.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    });
}
function fmtTime(d) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------
// ADAPTATION DE LA RÉPONSE DE L'API /api/ecran-accueil
// L'API renvoie { donneesRetour: [{ nom, moyenneTemperature,
// historiqueTemperature:[{heure,valeur}], moyenneHumidite,
// historiqueHumidite, moyennePression, historiquePression }] }
// L'historique ne couvre que la journée en cours (reset à minuit).
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// CALCULS
// ---------------------------------------------------------------
function average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function minMax(arr) {
    return { min: Math.min(...arr), max: Math.max(...arr) };
}

// ---------------------------------------------------------------
// COMPOSANT : Jauge horizontale (température ou humidité)
// ---------------------------------------------------------------
function Gauge({ value, range, color, unit, colors }) {
    const pct = ((value - range.min) / ((range.max - range.min) || 1)) * 100;
    return (
        <View style={{ marginTop: 10 }}>
            <View style={styles.gaugeTicks}>
                <Text style={[styles.tickText, { color: colors.muted }]}>
                    {range.min.toFixed(unit === '%' ? 0 : 1)}{unit}
                </Text>
                <Text style={[styles.tickText, { color: colors.muted }]}>
                    {range.max.toFixed(unit === '%' ? 0 : 1)}{unit}
                </Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.line }]}>
                <View
                    style={[
                        styles.fill,
                        { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color, opacity: 0.35 },
                    ]}
                />
                <View
                    style={[
                        styles.marker,
                        { left: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color },
                    ]}
                />
            </View>
        </View>
    );
}

// ---------------------------------------------------------------
// COMPOSANT : Carte de pièce
// ---------------------------------------------------------------
function RoomCard({ room, selected, onPress, colors }) {
    const temps = room.history.map((h) => h.temperature);
    const hums = room.history.map((h) => h.humidity);
    const tRange = minMax(temps);
    const hRange = minMax(hums);
    const ageMin = (Date.now() - new Date(room.current.timestamp).getTime()) / 60000;
    const stale = ageMin > 30;

    return (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={onPress}
            style={[
                styles.roomCard,
                {
                    backgroundColor: colors.surface,
                    borderColor: selected ? colors.temp : 'transparent',
                },
            ]}
        >
            <View style={styles.roomHead}>
                <Text style={[styles.roomName, { color: colors.ink }]}>{room.name}</Text>
                <View style={[styles.dot, { backgroundColor: stale ? colors.warn : colors.good }]} />
            </View>

            <Text style={[styles.roomTemp, { color: colors.temp }]}>
                {room.current.temperature.toFixed(1)}
                <Text style={styles.roomTempUnit}> °C</Text>
            </Text>

            <Gauge value={room.current.temperature} range={tRange} color={colors.temp} unit="°" colors={colors} />

            <View style={styles.roomHumRow}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Humidité</Text>
                <Text style={{ color: colors.hum, fontWeight: '600', fontSize: 14 }}>
                    {room.current.humidity}%
                </Text>
            </View>
            <Gauge value={room.current.humidity} range={hRange} color={colors.hum} unit="%" colors={colors} />

            {room.pressure != null && (
                <View style={[styles.roomHumRow, { marginTop: 8 }]}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>Pression</Text>
                    <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 13 }}>
                        {room.pressure.toFixed(1)} hPa
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

// ---------------------------------------------------------------
// COMPOSANT : Graphique
// ---------------------------------------------------------------
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function TooltipValue({ state, colors }) {
    const animatedProps = useAnimatedProps(() => {
        return {
            text: `${state.y.temperature.value.value.toFixed(1)}°`,
        };
    });

    return (
        <AnimatedTextInput
            underlineColorAndroid="transparent"
            editable={false}
            value=""
            animatedProps={animatedProps}
            style={{
                color: colors.ink,
                fontWeight: '600',
                fontSize: 14,
                padding: 0,
                margin: 0,
                backgroundColor: 'transparent',
                borderWidth: 0,
            }}
        />
    );
}

function ChartKit({ type, selectedRoom, colors, screenWidth, tooltip, setTooltip }) {
    const isTemp = type === "temperature";
    const lineColor = isTemp ? colors.temp : colors.hum;
    const unit = isTemp ? "°C" : "%";
    const width = screenWidth - 50;
    const active = tooltip && tooltip.type === type ? tooltip : null;
    const TIP_W = 120;
    const CHART_H = 170, PAD_TOP = 16, PAD_RIGHT = 64;
    const values = selectedRoom.history.map((h) => h[type]);
    const n = values.length;
    const vMin = Math.min(...values), vMax = Math.max(...values);
    const scaler = (vMax - vMin) || 1;

    // Position d'un point, même formule que react-native-chart-kit
    const pointX = (i) => PAD_RIGHT + (i * (width - PAD_RIGHT)) / Math.max(n, 1);
    const pointY = (v) => ((CHART_H - CHART_H * ((v - vMin) / scaler)) / 4) * 3 + PAD_TOP;

    // Un appui n'importe où sur le graphique choisit le point le plus proche en largeur
    const onTouch = (e) => {
        const tx = e.nativeEvent.locationX;
        let best = 0;
        for (let i = 1; i < n; i++) {
            if (Math.abs(pointX(i) - tx) < Math.abs(pointX(best) - tx)) best = i;
        }
        const h = selectedRoom.history[best];
        setTooltip({
            type,
            temperature: h.temperature,
            humidity: h.humidity,
            heure: fmtTime(new Date(h.timestamp)).replace(":", " h "),
            x: pointX(best),
            y: pointY(h[type]),
        });
    };

    return <View>
        <LineChart
            data={{
                labels: sampleLabels(selectedRoom.history),
                datasets: [{ data: selectedRoom.history.map((h) => h[type]) }],
            }}
            width={width}
            height={170}
            withInnerLines
            withVerticalLines={false}
            withOuterLines={false}
            fromZero={false}
            segments={3}
            yAxisSuffix={isTemp ? "°" : "%"}
            chartConfig={chartConfig(colors, lineColor)}
            bezier style={styles.chartInner}
            getDotProps={() => ({
                r: "0",
                strokeWidth: "0",
                fill: "transparent",
                stroke: "transparent",
            })}
            decorator={() => active ? (
                <G>
                    <Line x1={active.x} x2={active.x} y1={8} y2={130} stroke={colors.muted} strokeWidth="1" strokeDasharray="3,3" />
                    <Circle cx={active.x} cy={active.y} r="6" fill={colors.surface} stroke={lineColor} strokeWidth="3" />
                </G>
            ) : null}
        />

        <Pressable
            onPressIn={onTouch}
            style={{ position: "absolute", left: 0, top: 0, width, height: CHART_H }}
        />

        {active && (
            <View
                pointerEvents="none"
                style={{
                    position: "absolute",
                    left: Math.max(0, Math.min(width - TIP_W, active.x - TIP_W / 2)),
                    top: Math.max(0, active.y - 52),
                    width: TIP_W,
                    backgroundColor: colors.ink,
                    paddingVertical: 5,
                    borderRadius: 8,
                    alignItems: "center",
                }}
            >
                <Text style={{ color: colors.surface, fontWeight: "700", fontSize: 15 }}>
                    {Number(isTemp ? active.temperature : active.humidity).toFixed(1).replace(".", ",")} {unit}
                </Text>
                <Text style={{ color: colors.surface, opacity: 0.75, fontSize: 11 }}>{active.heure}</Text>
            </View>
        )}
    </View>
}
// ---------------------------------------------------------------
// APPLICATION PRINCIPALE
// ---------------------------------------------------------------
registerWidgetTaskHandler(widgetTaskHandler);
export default function App() {
    const scheme = useColorScheme();
    const colors = scheme === 'dark' ? PALETTES.dark : PALETTES.light;

    const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
    const [showPicker, setShowPicker] = useState(false);
    const [rooms, setRooms] = useState([]);
    const [selectedRoomId, setSelectedRoomId] = useState(null);
    const [lastSync, setLastSync] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);
    const [loading, setLoading] = useState(false);
    const intervalRef = useRef(null);
    const scrollRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);
    const [exterior, setExterior] = useState(null);
    const [mode, setMode] = useState('jour'); // 'jour' | '7j'
    const [week, setWeek] = useState(null);
    const [weekLoading, setWeekLoading] = useState(false);

    useEffect(() => {
        if (!tooltip) return;

        const timer = setTimeout(() => {
            setTooltip(null);
        }, 3000);

        return () => clearTimeout(timer);
    }, [tooltip]);

    useEffect(() => {
    }, [])


    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchData(selectedDate);
            console.log(data)
            setRooms(data.rooms);
            setExterior(data.exterior);
            setLastSync(new Date());
            setErrorMsg(null);
            setSelectedRoomId((prev) => prev || (data.rooms[0] && data.rooms[0].id));
        } catch (e) {
            console.error(e)
            if (e.message.includes('ConnectException') || e.message.includes('fetch failed')) {
                setErrorMsg('Impossible de se connecter au serveur ' + await getURL());
            } else {
                setErrorMsg('Échec de la récupération : ' + e.message);
            }
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        refresh();
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(refresh, REFRESH_MS);
        return () => clearInterval(intervalRef.current);
    }, [refresh]);

    // Données des 7 derniers jours, chargées seulement dans ce mode
    useEffect(() => {
        if (mode !== '7j') return;
        let annule = false;
        setWeekLoading(true);
        fetchWeek(selectedDate).then((w) => {
            if (!annule) { setWeek(w); setWeekLoading(false); }
        });
        return () => { annule = true; };
    }, [mode, selectedDate, lastSync]);

    const goPrevDay = () => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() - 1);
        setSelectedDate(startOfDay(d));
    };
    const goNextDay = () => {
        const today = startOfDay(new Date());
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + 1);
        if (d > today) return;
        setSelectedDate(startOfDay(d));
    };
    const onPickDate = (event, date) => {
        setShowPicker(Platform.OS === 'ios'); // iOS garde le picker inline visible via modal géré par le composant
        if (date) {
            const today = startOfDay(new Date());
            const d = startOfDay(date);
            setSelectedDate(d > today ? today : d);
        }
    };

    const isToday = isSameDay(selectedDate, startOfDay(new Date()));
    const selectedRoom =
        selectedRoomId === 'exterieur'
            ? (exterior && { id: 'exterieur', name: 'Extérieur', current: exterior.current, history: exterior.history, pressure: null })
            : (rooms.find((r) => r.id === selectedRoomId) || rooms[0]);
    const curTemps = rooms.map((r) => r.current.temperature);
    const curHums = rooms.map((r) => r.current.humidity);

    const screenWidth = Dimensions.get('window').width;
    return (
        <>
            <StatusBar style="auto" />

            <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
                <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 40 }}>
                    {/* En-tête */}
                    <View style={styles.header}>
                        <View>
                            <Text style={[styles.h1, { color: colors.ink }]}>Station météo</Text>
                            <Text style={{ color: colors.muted, fontSize: 12 }}>
                                {errorMsg
                                    ? errorMsg
                                    : lastSync
                                        ? 'Dernière mise à jour ' + fmtTime(lastSync)
                                        : 'En attente de données…'}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={refresh}
                            style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.line }]}
                        >
                            {loading ? (
                                <ActivityIndicator size="small" color={colors.muted} />
                            ) : (
                                <Text style={{ color: colors.muted, fontSize: 30, marginTop: -5 }}>↻</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Navigation par jour */}
                    <View style={[styles.dateNav, { backgroundColor: colors.surface, shadowColor: '#000' }]}>
                        <TouchableOpacity
                            onPress={goPrevDay}
                            style={[styles.navArrow, { backgroundColor: colors.surface2, borderColor: colors.line }]}
                        >
                            <Text style={{ color: colors.ink, fontSize: 18 }}>‹</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={{ flex: 1, alignItems: 'center' }} onPress={() => setShowPicker(true)}>
                            <Text style={[styles.dateLabel, { color: colors.ink }]}>{formatDateLabel(selectedDate)}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={goNextDay}
                            disabled={isToday}
                            style={[
                                styles.navArrow,
                                { backgroundColor: colors.surface2, borderColor: colors.line, opacity: isToday ? 0.3 : 1 },
                            ]}
                        >
                            <Text style={{ color: colors.ink, fontSize: 18 }}>›</Text>
                        </TouchableOpacity>
                    </View>

                    {showPicker && (
                        <DateTimePicker
                            value={selectedDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'inline' : 'default'}
                            maximumDate={new Date()}
                            onChange={onPickDate}
                        />
                    )}

                    {/* Cartes résumé */}
                    <View style={styles.summaryRow}>
                        <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
                            <Text style={[styles.summaryLabel, { color: colors.muted }]}><Text style={{ fontSize: 15 }}>🌡️</Text> MOY.</Text>
                            <Text style={[styles.summaryValue, { color: colors.temp }]}>
                                {curTemps.length ? average(curTemps).toFixed(1) + '°' : '–'}
                            </Text>
                        </View>
                        <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
                            <Text style={[styles.summaryLabel, { color: colors.muted }]}><Text style={{ fontSize: 15 }}>💧</Text> MOY. </Text>
                            <Text style={[styles.summaryValue, { color: colors.hum }]}>
                                {curHums.length ? Math.round(average(curHums)) + '%' : '–'}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.summaryCard, {
                                backgroundColor: colors.surface, borderWidth: 2, borderColor: selectedRoomId === 'exterieur' ? colors.temp : 'transparent'
                            }]}
                            onPress={() => {
                                setTooltip(false)
                                setSelectedRoomId('exterieur')
                            }}
                        >
                            <Text style={[styles.summaryLabel, { color: colors.muted }]}><Text style={{ fontSize: 15 }}>🌡️</Text> EXT.</Text>
                            <Text style={[styles.summaryValue, { color: colors.temp }]}>
                                {exterior ? exterior.current.temperature.toFixed(1) : '--'}°
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Grille des pièces */}
                    {rooms.length === 0 ? (
                        <Text style={{ textAlign: 'center', color: colors.muted, marginTop: 40 }}>
                            {errorMsg ? errorMsg : 'Aucune donnée.'}
                        </Text>
                    ) : (
                        <View style={styles.roomsGrid}>
                            {rooms.map((r) => (
                                <RoomCard
                                    key={r.id}
                                    room={r}
                                    selected={r.id === selectedRoomId}
                                    onPress={() => {
                                        setTooltip(false)
                                        setSelectedRoomId(r.id)
                                    }}
                                    colors={colors}
                                />
                            ))}
                        </View>
                    )}

                    {/* Graphique de la pièce sélectionnée */}
                    {selectedRoom && (
                        <View style={styles.chartSection}>
                            <Text style={[styles.chartTitle, { color: colors.ink }]}>{selectedRoom.name ? selectedRoom.name : "Temperature extérieure"}</Text>

                            <View style={styles.statRow}>
                                {(() => {
                                    const temps = selectedRoom.history.map((h) => h.temperature);
                                    return (
                                        <>
                                            <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
                                                <Text style={[styles.statLabel, { color: colors.muted }]}>MIN</Text>
                                                <Text style={[styles.statValue, { color: colors.ink }]}>{Math.min(...temps).toFixed(1)}°</Text>
                                            </View>
                                            <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
                                                <Text style={[styles.statLabel, { color: colors.muted }]}>MOY</Text>
                                                <Text style={[styles.statValue, { color: colors.ink }]}>{average(temps).toFixed(1)}°</Text>
                                            </View>
                                            <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
                                                <Text style={[styles.statLabel, { color: colors.muted }]}>MAX</Text>
                                                <Text style={[styles.statValue, { color: colors.ink }]}>{Math.max(...temps).toFixed(1)}°</Text>
                                            </View>
                                        </>
                                    );
                                })()}
                            </View>

                            <View style={[styles.chartBox, { backgroundColor: colors.surface }]}>
                                <View style={[styles.modeRow, { backgroundColor: colors.surface2 }]}>
                                    {[['jour', 'Jour'], ['7j', '7 jours']].map(([k, label]) => (
                                        <TouchableOpacity
                                            key={k}
                                            onPress={() => { setTooltip(null); setMode(k); }}
                                            style={[styles.modeBtn, mode === k && { backgroundColor: colors.surface }]}
                                        >
                                            <Text style={{ color: mode === k ? colors.ink : colors.muted, fontWeight: '600', fontSize: 13 }}>{label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {mode === '7j' ? (
                                    <>
                                        <Text style={{ color: colors.temp, fontSize: 11, fontWeight: '600', marginBottom: 6 }}>
                                            Température par heure (°C)
                                        </Text>
                                        {weekLoading && !week ? (
                                            <ActivityIndicator style={{ paddingVertical: 60 }} color={colors.muted} />
                                        ) : (
                                            <WeekChart
                                                series={weekSeries(week, selectedRoom)}
                                                width={screenWidth - 60}
                                                colors={colors}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <>
                                <View>
                                        <Text style={{ color: colors.temp, fontSize: 11, fontWeight: '600', marginBottom: 4 }}>
                                            Température (°C)
                                        </Text>
                                    </View>
                                    <View style={{
                                        position: "relative",
                                        left: -12.5
                                    }}>
                                        <ChartKit type="temperature" selectedRoom={selectedRoom} colors={colors} screenWidth={screenWidth} tooltip={tooltip} setTooltip={setTooltip} />
                                    </View>


                                    <Text style={{ color: colors.hum, fontSize: 11, fontWeight: '600', marginTop: 15, marginBottom: 4 }}>
                                        Humidité (%)
                                    </Text>
                                    <View style={{
                                        position: "relative",
                                        left: -12.5
                                    }}>
                                        <ChartKit type="humidity" selectedRoom={selectedRoom} colors={colors} screenWidth={screenWidth} tooltip={tooltip} setTooltip={setTooltip} />
                                    </View>
                                    </>
                                )}
                            </View>
                        </View>
                    )}
                </ScrollView>
            </SafeAreaView ></>
    );
}

// Moyenne de température par heure (24 valeurs, null si aucune mesure)
function hourlyMeans(history) {
    const sums = Array(24).fill(0), counts = Array(24).fill(0);
    history.forEach((h) => {
        if (h.temperature == null) return;
        const hr = new Date(h.timestamp).getHours();
        sums[hr] += h.temperature;
        counts[hr] += 1;
    });
    return sums.map((sm, i) => (counts[i] ? sm / counts[i] : null));
}

// Une série par jour pour la pièce choisie
function weekSeries(week, room) {
    if (!week || !room) return [];
    return week.map(({ date, data }) => {
        let history = [];
        if (data) {
            const src = room.id === 'exterieur' ? data.exterior : data.rooms.find((r) => r.name === room.name);
            history = src ? src.history : [];
        }
        return { date, values: hourlyMeans(history) };
    });
}

// Sous-échantillonne les labels d'heure pour ne pas surcharger l'axe X
function sampleLabels(history) {
    const max = 4;
    const step = Math.max(1, Math.floor(history.length / max));
    return history.map((h, i) => (i % step === 0 ? fmtTime(new Date(h.timestamp)) : ''));
}

function chartConfig(colors, lineColor) {
    return {
        backgroundGradientFrom: colors.surface,
        backgroundGradientTo: colors.surface,
        decimalPlaces: 1,

        color: () => lineColor,
        labelColor: () => colors.muted,

        propsForBackgroundLines: { stroke: colors.line, strokeDasharray: '' },
        propsForLabels: { fontSize: 11 },
        fillShadowGradientFrom: lineColor,
        fillShadowGradientFromOpacity: 0.18,
        fillShadowGradientTo: colors.surface,
        fillShadowGradientToOpacity: 0,
        propsForDots: { r: '0' },
    };
}

// ---------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------
const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: {
        paddingHorizontal: 18,
        paddingTop: 12,
        paddingBottom: 14,
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    h1: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 2
    },
    iconBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateNav: {
        marginHorizontal: 18,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        padding: 8,
        elevation: 2,
        shadowOpacity: 0.08,
        shadowRadius: 6,
        shadowOffset: {
            width: 0,
            height: 2
        },
    },
    navArrow: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateLabel: {
        fontWeight: '600',
        fontSize: 14
    },
    summaryRow: {
        flexDirection: 'row',
        marginHorizontal: 18,
        marginBottom: 14,
        gap: 10
    },
    summaryCard: {
        flex: 1,
        borderRadius: 18,
        padding: 12,
        elevation: 2
    },
    summaryLabel: {
        fontSize: 12,
        letterSpacing: 0.5
    },
    summaryValue: {
        fontSize: 26,
        fontWeight: '600',
        marginTop: 2
    },
    roomsGrid: {
        marginHorizontal: 18,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'space-between',
    },
    roomCard: {
        width: '48%',
        borderRadius: 18,
        padding: 14,
        marginBottom: 10,
        borderWidth: 2,
        elevation: 2,
    },
    roomHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8
    },
    roomName: {
        fontWeight: '600',
        fontSize: 13
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4
    },
    roomTemp: {
        fontSize: 26,
        fontWeight: '600'
    },
    roomTempUnit: {
        fontSize: 14,
        fontWeight: '500'
    },
    gaugeTicks: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 3
    },
    tickText: {
        fontSize: 10
    },
    track: {
        height: 5,
        borderRadius: 3,
        position: 'relative'
    },
    fill: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        borderRadius: 3
    },
    marker: {
        position: 'absolute',
        top: -3,
        width: 3,
        height: 11,
        borderRadius: 2,
        marginLeft: -1.5
    },
    roomHumRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12
    },
    chartSection: {
        marginHorizontal: 18,
        marginTop: 10
    },
    chartTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 10
    },
    statRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 14
    },
    statBox: {
        flex: 1,
        borderRadius: 14,
        padding: 10,
        alignItems: 'center',
        elevation: 2
    },
    statLabel: {
        fontSize: 16,
        textTransform: 'uppercase'
    },
    statValue: {
        fontWeight: '600',
        marginTop: 2,
        fontSize: 20
    },
    modeRow: {
        flexDirection: 'row',
        borderRadius: 10,
        padding: 3,
        marginBottom: 12
    },
    modeBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 7,
        borderRadius: 8
    },
    chartBox: {
        borderRadius: 18,
        padding: 12,
        elevation: 2
    },
    chartInner: {
        borderRadius: 12,
        marginVertical: 4
    },
});