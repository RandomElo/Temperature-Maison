import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Line, Path, Circle, Text as SvgText } from 'react-native-svg';

// Une couleur par jour, le plus récent en premier (épais).
const DAY_COLORS = ['#E4572E', '#F3A712', '#76B041', '#2BB5A5', '#3A86FF', '#8E6CEF', '#D6409F'];

const PAD_L = 34, PAD_R = 10, PAD_T = 10, PAD_B = 22, HEIGHT = 200;

function dayLabel(d) {
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace('.', '');
}

// series : [{ date, values: [24 moyennes horaires ou null] }], du plus ancien au plus récent
export default function WeekChart({ series, width, colors }) {
    const [hour, setHour] = useState(null);

    const all = series.flatMap((s) => s.values).filter((v) => v != null);
    if (all.length === 0) {
        return <Text style={{ color: colors.muted, textAlign: 'center', paddingVertical: 30 }}>Aucune donnée</Text>;
    }
    const yMin = Math.floor(Math.min(...all) - 0.5);
    const yMax = Math.ceil(Math.max(...all) + 0.5);
    const plotW = width - PAD_L - PAD_R;
    const plotH = HEIGHT - PAD_T - PAD_B;
    const x = (h) => PAD_L + (h * plotW) / 23;
    const y = (v) => PAD_T + plotH * (1 - (v - yMin) / (yMax - yMin));
    const ticks = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * i) / 3);

    const onTouch = (e) => {
        const h = Math.round(((e.nativeEvent.locationX - PAD_L) * 23) / plotW);
        setHour(Math.max(0, Math.min(23, h)));
    };

    // Du plus ancien au plus récent : le plus récent est dessiné par-dessus
    const ordered = series.map((s, i) => ({ ...s, color: DAY_COLORS[series.length - 1 - i], recent: i === series.length - 1 }));

    return (
        <View>
            <View style={{ width, height: HEIGHT }}>
                <Svg width={width} height={HEIGHT}>
                    {ticks.map((t, i) => (
                        <React.Fragment key={i}>
                            <Line x1={PAD_L} x2={width - PAD_R} y1={y(t)} y2={y(t)} stroke={colors.line} strokeWidth="1" />
                            <SvgText x={PAD_L - 6} y={y(t) + 4} fontSize="11" fill={colors.muted} textAnchor="end">
                                {Math.round(t * 10) / 10}°
                            </SvgText>
                        </React.Fragment>
                    ))}
                    {[0, 6, 12, 18, 23].map((h) => (
                        <SvgText key={h} x={x(h)} y={HEIGHT - 6} fontSize="11" fill={colors.muted} textAnchor="middle">
                            {h} h
                        </SvgText>
                    ))}

                    {hour != null && (
                        <Line x1={x(hour)} x2={x(hour)} y1={PAD_T} y2={PAD_T + plotH} stroke={colors.muted} strokeWidth="1" strokeDasharray="3,3" />
                    )}

                    {ordered.map((s) => {
                        let d = '';
                        let prev = false;
                        s.values.forEach((v, h) => {
                            if (v == null) { prev = false; return; }
                            d += `${prev ? 'L' : 'M'}${x(h)} ${y(v)} `;
                            prev = true;
                        });
                        return (
                            <React.Fragment key={s.date.toISOString()}>
                                <Path d={d} stroke={s.color} strokeWidth={s.recent ? 3 : 1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" opacity={s.recent ? 1 : 0.85} />
                                {s.values.map((v, h) => v == null ? null : (
                                    <Circle key={h} cx={x(h)} cy={y(v)} r={s.recent ? 3 : 2} fill={s.color} />
                                ))}
                            </React.Fragment>
                        );
                    })}

                    {hour != null && ordered.map((s) => s.values[hour] == null ? null : (
                        <Circle key={'sel' + s.date.toISOString()} cx={x(hour)} cy={y(s.values[hour])} r="5.5" fill={colors.surface} stroke={s.color} strokeWidth="2.5" />
                    ))}
                </Svg>
                <Pressable onPressIn={onTouch} style={{ position: 'absolute', left: 0, top: 0, width, height: HEIGHT }} />
            </View>

            <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13, marginTop: 8, minHeight: 18 }}>
                {hour != null ? `${hour} h` : ' '}
            </Text>

            {/* Légende : un jour par puce, la valeur de l'heure choisie s'affiche dedans */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {[...ordered].reverse().map((s) => {
                    const v = hour != null ? s.values[hour] : null;
                    return (
                        <View key={s.date.toISOString()} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: s.color }} />
                            <Text style={{ color: colors.ink, fontSize: 12 }}>{dayLabel(s.date)}</Text>
                            {hour != null && (
                                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>
                                    {v == null ? '–' : v.toFixed(1).replace('.', ',') + '°'}
                                </Text>
                            )}
                        </View>
                    );
                })}
            </View>
        </View>
    );
}
