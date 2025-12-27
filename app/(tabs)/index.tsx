import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler, // 🌟 [필수] 앱 종료 기능
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// --- [타입 정의] ---
interface Memo {
  id: string;
  content: string;
}
interface WeatherData {
  temp: number;
  condition: string;
  iconName: keyof typeof MaterialCommunityIcons.glyphMap;
  city: string;
  humidity: number;
  windSpeed: number;
}
interface ForecastItem {
  dt: number;
  temp: number;
  iconName: keyof typeof MaterialCommunityIcons.glyphMap;
  time: string;
  pop: number;
}
interface DailyForecast {
  date: string;
  min: number;
  max: number;
  iconName: keyof typeof MaterialCommunityIcons.glyphMap;
  pop: number;
}
interface AirQuality {
  pm10: number;
  pm2_5: number;
  status: string;
}

const API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
const DEFAULT_BG =
  "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?q=80&w=2070&auto=format&fit=crop";
const LOOP_COUNT = 100;

// ---------------------------------------------------------
// [컴포넌트] 잠금화면 오버레이
// ---------------------------------------------------------
const LockScreenOverlay = ({
  onUnlock,
  onViewMemo,
}: {
  onUnlock: () => void;
  onViewMemo: () => void;
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayName = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
    return `${month}월 ${day}일 ${dayName}요일`;
  };

  return (
    <View style={styles.lockOverlay}>
      <View style={styles.lockClockContainer}>
        <Text style={styles.lockTimeText}>
          {time.getHours().toString().padStart(2, "0")}:
          {time.getMinutes().toString().padStart(2, "0")}
        </Text>
        <Text style={styles.lockDateText}>{formatDate(time)}</Text>
      </View>

      <View style={styles.lockBottomContainer}>
        {/* 1. 메모만 살짝 보기 버튼 */}
        <TouchableOpacity style={styles.viewMemoButton} onPress={onViewMemo}>
          <MaterialCommunityIcons
            name="note-text-outline"
            size={20}
            color="#ddd"
          />
          <Text style={styles.viewMemoText}>메모 보기</Text>
        </TouchableOpacity>

        {/* 2. 🌟 진짜 잠금해제 (앱 종료) 버튼 */}
        <TouchableOpacity
          style={styles.unlockButton}
          onPress={onUnlock}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="lock-open-variant-outline"
            size={28}
            color="#fff"
            style={{ marginRight: 10 }}
          />
          <Text style={styles.unlockText}>잠금해제</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default function HomeScreen() {
  const { width, height } = Dimensions.get("window");
  const flatListRef = useRef<FlatList>(null);

  const [currentTime, setCurrentTime] = useState(new Date());

  // 🌟 잠금 상태 관리 (기본값: true)
  const [isLocked, setIsLocked] = useState(true);

  // 메모 상태
  const [memos, setMemos] = useState<Memo[]>([]);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [newMemoText, setNewMemoText] = useState("");
  const [memoModalVisible, setMemoModalVisible] = useState(false);

  // 배경화면 상태
  const [bgList, setBgList] = useState<string[]>([]);

  // UI 상태
  const [menuVisible, setMenuVisible] = useState(false);
  const [bgListModalVisible, setBgListModalVisible] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedBgs, setSelectedBgs] = useState<string[]>([]);

  // 날씨 상태
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [hourlyForecast, setHourlyForecast] = useState<ForecastItem[]>([]);
  const [dailyForecast, setDailyForecast] = useState<DailyForecast[]>([]);
  const [airQuality, setAirQuality] = useState<AirQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [weatherModalVisible, setWeatherModalVisible] = useState(false);

  const backgroundData =
    bgList.length > 0 ? Array(LOOP_COUNT).fill(bgList).flat() : [DEFAULT_BG];
  const initialScrollIndex =
    bgList.length > 0 ? Math.floor(backgroundData.length / 2) : 0;

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMemos();
      loadBgList();
    }, [])
  );

  // --- [날씨 로직] ---
  const fetchAllWeatherData = useCallback(async () => {
    try {
      setLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLoading(false);
        return;
      }

      const {
        coords: { latitude, longitude },
      } = await Location.getCurrentPositionAsync({});
      const location = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });
      let address =
        location[0]?.district || location[0]?.city || "위치 확인 불가";

      const weatherRes = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric`
      );
      const forecastRes = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric`
      );
      const airRes = await fetch(
        `http://api.openweathermap.org/data/2.5/air_pollution?lat=${latitude}&lon=${longitude}&appid=${API_KEY}`
      );

      const weatherJson = await weatherRes.json();
      const forecastJson = await forecastRes.json();
      const airJson = await airRes.json();

      if (weatherRes.ok && forecastRes.ok && airRes.ok) {
        const info = getWeatherInfo(weatherJson.weather[0].main);
        setWeather({
          temp: Math.round(weatherJson.main.temp),
          condition: info.ko,
          iconName: info.icon,
          city: address,
          humidity: weatherJson.main.humidity,
          windSpeed: weatherJson.wind.speed,
        });

        const hourly: ForecastItem[] = forecastJson.list
          .slice(0, 8)
          .map((item: any) => ({
            dt: item.dt,
            temp: Math.round(item.main.temp),
            iconName: getWeatherInfo(item.weather[0].main).icon,
            time: new Date(item.dt * 1000).getHours() + "시",
            pop: Math.round(item.pop * 100),
          }));
        setHourlyForecast(hourly);

        const dailyMap = new Map<
          string,
          { min: number; max: number; icon: string; maxPop: number }
        >();
        forecastJson.list.forEach((item: any) => {
          const dateObj = new Date(item.dt * 1000);
          const dateKey = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
          const temp = item.main.temp;
          const icon = getWeatherInfo(item.weather[0].main).icon;
          const pop = item.pop * 100;

          if (!dailyMap.has(dateKey)) {
            dailyMap.set(dateKey, {
              min: temp,
              max: temp,
              icon: icon,
              maxPop: pop,
            });
          } else {
            const current = dailyMap.get(dateKey)!;
            current.min = Math.min(current.min, temp);
            current.max = Math.max(current.max, temp);
            current.maxPop = Math.max(current.maxPop, pop);
            if (dateObj.getHours() >= 12 && dateObj.getHours() <= 15)
              current.icon = icon;
          }
        });

        const daily: DailyForecast[] = Array.from(dailyMap.entries())
          .slice(0, 5)
          .map(([date, val]) => ({
            date: date,
            min: Math.round(val.min),
            max: Math.round(val.max),
            iconName: val.icon as keyof typeof MaterialCommunityIcons.glyphMap,
            pop: Math.round(val.maxPop),
          }));
        setDailyForecast(daily);

        const pm2_5 = airJson.list[0].components.pm2_5;
        const pm10 = airJson.list[0].components.pm10;
        let airStatus = "좋음";
        if (pm10 > 150 || pm2_5 > 75) airStatus = "매우 나쁨";
        else if (pm10 > 80 || pm2_5 > 35) airStatus = "나쁨";
        else if (pm10 > 30 || pm2_5 > 15) airStatus = "보통";
        setAirQuality({ pm10, pm2_5, status: airStatus });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLocked) {
      fetchAllWeatherData();
    }
  }, [fetchAllWeatherData, isLocked]);

  const loadMemos = async () => {
    try {
      const savedMemos = await AsyncStorage.getItem("MY_MEMOS");
      const savedSelectedId = await AsyncStorage.getItem("MY_SELECTED_MEMO_ID");
      if (savedMemos) setMemos(JSON.parse(savedMemos));
      if (savedSelectedId) {
        const parsedMemos = JSON.parse(savedMemos || "[]");
        const exists = parsedMemos.some((m: Memo) => m.id === savedSelectedId);
        if (exists) {
          setSelectedMemoId(savedSelectedId);
        } else {
          setSelectedMemoId(null);
          await AsyncStorage.removeItem("MY_SELECTED_MEMO_ID");
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const addMemo = async () => {
    if (!newMemoText.trim()) return;
    const newMemo: Memo = { id: Date.now().toString(), content: newMemoText };
    const updatedMemos = [...memos, newMemo];
    setMemos(updatedMemos);
    setNewMemoText("");
    await AsyncStorage.setItem("MY_MEMOS", JSON.stringify(updatedMemos));
    if (updatedMemos.length === 1) selectMemo(newMemo.id);
  };

  const deleteMemo = async (id: string) => {
    const updatedMemos = memos.filter((m) => m.id !== id);
    setMemos(updatedMemos);
    await AsyncStorage.setItem("MY_MEMOS", JSON.stringify(updatedMemos));
    if (selectedMemoId === id) {
      setSelectedMemoId(null);
      await AsyncStorage.removeItem("MY_SELECTED_MEMO_ID");
    }
  };

  const selectMemo = async (id: string) => {
    const newId = selectedMemoId === id ? null : id;
    setSelectedMemoId(newId);
    if (newId) await AsyncStorage.setItem("MY_SELECTED_MEMO_ID", newId);
    else await AsyncStorage.removeItem("MY_SELECTED_MEMO_ID");
  };

  const displayMemoText =
    memos.find((m) => m.id === selectedMemoId)?.content || "";

  const loadBgList = async () => {
    try {
      const savedBgList = await AsyncStorage.getItem("MY_BG_LIST");
      if (savedBgList) setBgList(JSON.parse(savedBgList));
    } catch (e) {
      console.error(e);
    }
  };

  const addToBgList = async () => {
    setMenuVisible(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("권한 필요", "갤러리 접근 권한이 필요합니다.");
      return;
    }
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 0,
      quality: 1,
    });
    if (!result.canceled) {
      const newUris = result.assets.map((asset) => asset.uri);
      const newList = [...bgList, ...newUris];
      setBgList(newList);
      await AsyncStorage.setItem("MY_BG_LIST", JSON.stringify(newList));
      Alert.alert(
        "추가 완료",
        `${newUris.length}장의 사진이 보관함에 저장되었습니다.`
      );
    }
  };

  const handleImagePress = (uri: string) => {
    if (isSelectionMode) {
      if (selectedBgs.includes(uri))
        setSelectedBgs(selectedBgs.filter((item) => item !== uri));
      else setSelectedBgs([...selectedBgs, uri]);
    } else {
      const index = backgroundData.indexOf(uri);
      if (index !== -1 && flatListRef.current) {
        setBgListModalVisible(false);
        const centerOffset = Math.floor(LOOP_COUNT / 2) * bgList.length;
        const targetIndex = centerOffset + (index % bgList.length);
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: targetIndex,
            animated: false,
          });
        }, 100);
      }
    }
  };

  const deleteSelectedImages = async () => {
    Alert.alert(
      "삭제",
      `선택한 ${selectedBgs.length}장의 사진을 삭제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            const newList = bgList.filter((uri) => !selectedBgs.includes(uri));
            setBgList(newList);
            await AsyncStorage.setItem("MY_BG_LIST", JSON.stringify(newList));
            setIsSelectionMode(false);
            setSelectedBgs([]);
          },
        },
      ]
    );
  };

  const getWeatherInfo = (
    condition: string
  ): { ko: string; icon: keyof typeof MaterialCommunityIcons.glyphMap } => {
    switch (condition) {
      case "Clear":
        return { ko: "맑음", icon: "weather-sunny" };
      case "Clouds":
        return { ko: "구름", icon: "weather-cloudy" };
      case "Rain":
        return { ko: "비", icon: "weather-rainy" };
      case "Snow":
        return { ko: "눈", icon: "weather-snowy" };
      case "Thunderstorm":
        return { ko: "뇌우", icon: "weather-lightning" };
      case "Mist":
      case "Fog":
        return { ko: "안개", icon: "weather-fog" };
      default:
        return { ko: condition, icon: "weather-cloudy" };
    }
  };

  const formatDate = (date: Date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayName = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
    return `${month}월 ${day}일 (${dayName})`;
  };

  const renderBgItem = ({ item }: { item: string }) => {
    const isSelected = selectedBgs.includes(item);
    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() => handleImagePress(item)}
        onLongPress={() => {
          setIsSelectionMode(true);
          setSelectedBgs([item]);
        }}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: item }}
          style={styles.gridImage}
          resizeMode="cover"
        />
        {isSelectionMode && (
          <View
            style={[
              styles.selectionOverlay,
              isSelected && styles.selectedOverlay,
            ]}
          >
            <MaterialCommunityIcons
              name={
                isSelected
                  ? "checkbox-marked-circle"
                  : "checkbox-blank-circle-outline"
              }
              size={24}
              color={isSelected ? "#4a90e2" : "#fff"}
            />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderBackground = ({ item }: { item: string }) => (
    <View
      style={{
        width: width,
        height: height,
        backgroundColor: "black",
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      <Image
        source={{ uri: item }}
        style={{ width: width, height: height }}
        resizeMode="contain"
      />
    </View>
  );

  // 🌟 [수정] 잠금해제 = 앱 종료
  const handleExitApp = () => {
    BackHandler.exitApp();
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />

      {/* 배경 */}
      <FlatList
        ref={flatListRef}
        data={backgroundData}
        renderItem={renderBackground}
        keyExtractor={(item, index) => index.toString()}
        horizontal={true}
        pagingEnabled={true}
        showsHorizontalScrollIndicator={false}
        style={styles.bgList}
        decelerationRate="fast"
        getItemLayout={(data, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        initialScrollIndex={initialScrollIndex}
      />

      {/* 🌟 조건부 렌더링: 잠금상태(Lock) vs 메인(Dashboard) */}
      {isLocked ? (
        <LockScreenOverlay
          onUnlock={handleExitApp} // 👈 🌟 잠금해제 누르면 앱 종료!
          onViewMemo={() => setIsLocked(false)} // 👈 메모 보기 누르면 앱 내부 진입
        />
      ) : (
        <View style={styles.overlay} pointerEvents="box-none">
          {/* 상단 그룹 */}
          <View style={{ zIndex: 10 }}>
            <View style={styles.topHeader}>
              <View>
                <Text style={styles.dateText}>{formatDate(currentTime)}</Text>
                <Text style={styles.timeText}>
                  {currentTime.getHours().toString().padStart(2, "0")}:
                  {currentTime.getMinutes().toString().padStart(2, "0")}
                </Text>
              </View>

              <View style={styles.topRightButtons}>
                {/* 🌟 여기도 앱 종료 버튼 유지 */}
                <TouchableOpacity
                  onPress={handleExitApp}
                  style={[
                    styles.smallIconButton,
                    {
                      marginRight: 5,
                      backgroundColor: "rgba(255, 107, 107, 0.3)",
                    },
                  ]}
                >
                  <MaterialCommunityIcons name="power" size={24} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setMemoModalVisible(true)}
                  style={styles.smallIconButton}
                >
                  <MaterialCommunityIcons
                    name="playlist-edit"
                    size={24}
                    color="rgba(255,255,255,0.8)"
                  />
                </TouchableOpacity>

                <View>
                  <TouchableOpacity
                    onPress={() => setMenuVisible(!menuVisible)}
                    style={styles.menuButton}
                  >
                    <MaterialCommunityIcons
                      name="menu"
                      size={32}
                      color="#fff"
                    />
                  </TouchableOpacity>

                  {menuVisible && (
                    <View style={styles.menuPopup}>
                      <Text style={styles.menuHeader}>
                        저장된 배경: {bgList.length}장
                      </Text>
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={addToBgList}
                      >
                        <MaterialCommunityIcons
                          name="image-plus"
                          size={24}
                          color="#fff"
                          style={styles.menuIcon}
                        />
                        <View>
                          <Text style={styles.menuTitle}>배경 사진 추가</Text>
                          <Text style={styles.menuDesc}>
                            리스트에 사진 추가
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.menuDivider} />
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => {
                          setMenuVisible(false);
                          setBgListModalVisible(true);
                        }}
                      >
                        <MaterialCommunityIcons
                          name="grid"
                          size={24}
                          color="#ffd700"
                          style={styles.menuIcon}
                        />
                        <View>
                          <Text
                            style={[styles.menuTitle, { color: "#ffd700" }]}
                          >
                            보관함 관리
                          </Text>
                          <Text style={styles.menuDesc}>사진 선택 및 삭제</Text>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.menuDivider} />
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => {
                          setMenuVisible(false);
                          setIsLocked(true);
                        }}
                      >
                        <MaterialCommunityIcons
                          name="lock"
                          size={24}
                          color="#ff6b6b"
                          style={styles.menuIcon}
                        />
                        <View>
                          <Text
                            style={[styles.menuTitle, { color: "#ff6b6b" }]}
                          >
                            화면 잠그기
                          </Text>
                          <Text style={styles.menuDesc}>잠금화면으로 이동</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.weatherSection}
              activeOpacity={0.7}
              onPress={() => setWeatherModalVisible(true)}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                weather && (
                  <View style={styles.weatherRow}>
                    <MaterialCommunityIcons
                      name={weather.iconName}
                      size={30}
                      color="#000000ff"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.weatherText}>
                      {weather.temp}°C {weather.condition}
                    </Text>
                    <Text style={styles.locationText}> | {weather.city}</Text>
                  </View>
                )
              )}
            </TouchableOpacity>
          </View>

          {/* 하단 그룹: 메모 */}
          <TouchableOpacity
            style={styles.memoSection}
            activeOpacity={0.7}
            onPress={() => setMemoModalVisible(true)}
          >
            {displayMemoText ? (
              <Text style={styles.memoText}>{displayMemoText}</Text>
            ) : null}
          </TouchableOpacity>
        </View>
      )}

      {/* --- Modals --- */}
      {/* 메모 모달 */}
      <Modal
        animationType="slide"
        visible={memoModalVisible}
        onRequestClose={() => setMemoModalVisible(false)}
        presentationStyle="pageSheet"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.listModalContainer}
        >
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>메모장 관리</Text>
            <TouchableOpacity onPress={() => setMemoModalVisible(false)}>
              <Text style={styles.headerButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="새로운 메모를 입력하세요"
              placeholderTextColor="#666"
              value={newMemoText}
              onChangeText={setNewMemoText}
              multiline
            />
            <TouchableOpacity style={styles.addButton} onPress={addMemo}>
              <MaterialCommunityIcons name="plus" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={memos}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.memoItem,
                  selectedMemoId === item.id && styles.selectedMemoItem,
                ]}
                onPress={() => selectMemo(item.id)}
              >
                <MaterialCommunityIcons
                  name={
                    selectedMemoId === item.id
                      ? "checkbox-marked-circle"
                      : "checkbox-blank-circle-outline"
                  }
                  size={24}
                  color={selectedMemoId === item.id ? "#4a90e2" : "#555"}
                  style={{ marginRight: 10 }}
                />
                <Text
                  style={[
                    styles.memoItemText,
                    selectedMemoId === item.id && {
                      color: "#fff",
                      fontWeight: "bold",
                    },
                  ]}
                >
                  {item.content}
                </Text>
                <TouchableOpacity
                  onPress={() => deleteMemo(item.id)}
                  style={{ padding: 5 }}
                >
                  <MaterialCommunityIcons
                    name="trash-can-outline"
                    size={20}
                    color="#ff6b6b"
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text
                style={{ color: "#666", textAlign: "center", marginTop: 50 }}
              >
                등록된 메모가 없습니다.
              </Text>
            }
          />
        </KeyboardAvoidingView>
      </Modal>

      {/* 배경 모달 */}
      <Modal
        animationType="fade"
        visible={bgListModalVisible}
        onRequestClose={() => setBgListModalVisible(false)}
      >
        <View style={styles.listModalContainer}>
          <View style={styles.listHeader}>
            {isSelectionMode ? (
              <TouchableOpacity
                onPress={() => {
                  setIsSelectionMode(false);
                  setSelectedBgs([]);
                }}
              >
                <Text style={styles.headerButtonText}>취소</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setBgListModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            )}
            <Text style={styles.listTitle}>
              {isSelectionMode
                ? `${selectedBgs.length}장 선택됨`
                : "배경화면 보관함"}
            </Text>
            {isSelectionMode ? (
              <TouchableOpacity
                onPress={deleteSelectedImages}
                disabled={selectedBgs.length === 0}
              >
                <Text style={[styles.headerButtonText, { color: "#ff6b6b" }]}>
                  삭제
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setIsSelectionMode(true)}>
                <Text style={styles.headerButtonText}>선택</Text>
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={bgList}
            renderItem={renderBgItem}
            keyExtractor={(item) => item}
            numColumns={3}
            contentContainerStyle={styles.gridContainer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>추가된 사진이 없습니다.</Text>
                <TouchableOpacity
                  style={styles.emptyAddButton}
                  onPress={addToBgList}
                >
                  <Text style={styles.emptyAddButtonText}>사진 추가하기</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </View>
      </Modal>

      {/* 날씨 모달 */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={weatherModalVisible}
        onRequestClose={() => setWeatherModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setWeatherModalVisible(false)}
            >
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>상세 날씨 정보</Text>
            {weather && airQuality && (
              <View style={styles.detailGrid}>
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons
                    name="water-percent"
                    size={24}
                    color="#4a90e2"
                  />
                  <Text style={styles.detailLabel}>습도</Text>
                  <Text style={styles.detailValue}>{weather.humidity}%</Text>
                </View>
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons
                    name="weather-windy"
                    size={24}
                    color="#a0e24a"
                  />
                  <Text style={styles.detailLabel}>풍속</Text>
                  <Text style={styles.detailValue}>{weather.windSpeed}m/s</Text>
                </View>
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons
                    name="blur"
                    size={24}
                    color={
                      airQuality.status.includes("나쁨") ? "#ff6b6b" : "#fff"
                    }
                  />
                  <Text style={styles.detailLabel}>미세먼지</Text>
                  <Text style={styles.detailValue}>{airQuality.status}</Text>
                </View>
              </View>
            )}
            <View style={styles.divider} />
            <Text style={styles.sectionHeader}>시간대별 예보</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.hourlyScroll}
            >
              {hourlyForecast.map((item, index) => (
                <View key={index} style={styles.hourlyItem}>
                  <Text style={styles.hourlyTime}>{item.time}</Text>
                  <MaterialCommunityIcons
                    name={item.iconName}
                    size={24}
                    color="#fff"
                    style={{ marginVertical: 5 }}
                  />
                  <Text style={styles.hourlyTemp}>{item.temp}°</Text>
                  {item.pop > 0 && (
                    <Text style={styles.popText}>☔{item.pop}%</Text>
                  )}
                </View>
              ))}
            </ScrollView>
            <View style={styles.divider} />
            <Text style={styles.sectionHeader}>주간 예보</Text>
            <View style={styles.dailyList}>
              {dailyForecast.map((item, index) => (
                <View key={index} style={styles.dailyItem}>
                  <Text style={styles.dailyDate}>{item.date}</Text>
                  <View style={styles.dailyIconRow}>
                    <MaterialCommunityIcons
                      name={item.iconName}
                      size={20}
                      color="#ccc"
                    />
                    {item.pop > 0 && (
                      <Text style={styles.dailyPop}>☔ {item.pop}%</Text>
                    )}
                  </View>
                  <View style={styles.dailyTemp}>
                    <Text style={{ color: "#4a90e2" }}>{item.min}°</Text>
                    <Text style={{ color: "#666" }}> / </Text>
                    <Text style={{ color: "#e24a4a" }}>{item.max}°</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  bgList: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },

  // 🌟 [추가] 잠금화면용 스타일 (버튼 영역 개선)
  lockOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    justifyContent: "space-between", // 위(시계) - 아래(버튼) 배치
    paddingTop: 100,
    paddingBottom: 50,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  lockClockContainer: {
    alignItems: "center",
  },
  lockTimeText: {
    fontSize: 80,
    fontWeight: "100",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  lockDateText: {
    fontSize: 22,
    color: "#eee",
    marginTop: 10,
    fontWeight: "300",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },

  // 하단 버튼 그룹
  lockBottomContainer: {
    alignItems: "center",
  },
  unlockButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: 18, // 버튼 크기 키움
    paddingHorizontal: 40,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.6)",
    marginTop: 20,
  },
  unlockText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
  },
  viewMemoButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
  },
  viewMemoText: {
    color: "#ddd",
    fontSize: 14,
    marginLeft: 5,
  },

  // 기존 스타일들...
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 30,
    justifyContent: "space-between",
  },

  topHeader: {
    marginTop: 60,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  topRightButtons: { flexDirection: "row", alignItems: "center" },
  smallIconButton: {
    padding: 8,
    marginRight: 5,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 20,
  },

  dateText: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5,
  },
  timeText: {
    fontSize: 70,
    color: "#fff",
    fontWeight: "200",
    marginTop: -5,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 10,
  },

  weatherSection: { marginTop: 10 },
  weatherRow: { flexDirection: "row", alignItems: "center" },
  weatherText: {
    fontSize: 22,
    color: "#000000ff",
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5,
  },
  locationText: {
    fontSize: 16,
    color: "#000000ff",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5,
  },

  memoSection: {
    marginBottom: 0,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  memoText: {
    fontSize: 24,
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
    lineHeight: 34,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 10,
  },

  menuButton: { padding: 8 },
  menuPopup: {
    position: "absolute",
    top: 50,
    right: 0,
    width: 250,
    backgroundColor: "rgba(0,0,0,0.9)",
    borderRadius: 15,
    padding: 15,
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    zIndex: 999,
  },
  menuHeader: {
    color: "#ffd700",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  menuIcon: { marginRight: 15 },
  menuTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  menuDesc: { color: "#aaa", fontSize: 12 },
  menuDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginVertical: 5,
  },

  listModalContainer: { flex: 1, backgroundColor: "#111", paddingTop: 50 },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  listTitle: { fontSize: 18, color: "#fff", fontWeight: "bold" },
  headerButtonText: { fontSize: 16, color: "#4a90e2", fontWeight: "600" },
  gridContainer: { padding: 2 },
  gridItem: {
    flex: 1 / 3,
    aspectRatio: 9 / 16,
    margin: 1,
    position: "relative",
  },
  gridImage: { width: "100%", height: "100%" },

  selectionOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedOverlay: {
    backgroundColor: "rgba(0,0,0,0.6)",
    borderColor: "#4a90e2",
  },

  emptyContainer: { alignItems: "center", marginTop: 100 },
  emptyText: { color: "#888", marginBottom: 20 },
  emptyAddButton: {
    backgroundColor: "#4a90e2",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyAddButtonText: { color: "#fff", fontWeight: "bold" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    height: "75%",
    backgroundColor: "#222",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
  },
  closeButton: { alignSelf: "flex-end", padding: 5 },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 20,
  },
  detailGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 10,
  },
  detailItem: { alignItems: "center" },
  detailLabel: { color: "#888", fontSize: 12, marginTop: 4 },
  detailValue: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "#444",
    marginVertical: 15,
  },
  sectionHeader: {
    width: "100%",
    color: "#ddd",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
  },
  hourlyScroll: { height: 100, flexGrow: 0 },
  hourlyItem: { alignItems: "center", marginRight: 20, width: 50 },
  hourlyTime: { color: "#aaa", fontSize: 12 },
  hourlyTemp: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  popText: { color: "#4a90e2", fontSize: 10, marginTop: 2 },
  dailyList: { width: "100%" },
  dailyItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
  },
  dailyDate: { color: "#fff", width: 60 },
  dailyIconRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  dailyPop: { color: "#4a90e2", fontSize: 12, marginLeft: 5 },
  dailyTemp: { flexDirection: "row" },

  inputContainer: {
    flexDirection: "row",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  input: {
    flex: 1,
    backgroundColor: "#222",
    color: "#fff",
    borderRadius: 10,
    padding: 10,
    marginRight: 10,
    maxHeight: 100,
  },
  addButton: {
    backgroundColor: "#4a90e2",
    borderRadius: 10,
    padding: 10,
    justifyContent: "center",
  },
  memoItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222",
    marginVertical: 5,
    padding: 15,
    borderRadius: 10,
    justifyContent: "space-between",
  },
  selectedMemoItem: {
    backgroundColor: "#333",
    borderColor: "#4a90e2",
    borderWidth: 1,
  },
  memoItemText: { color: "#ccc", flex: 1, fontSize: 16 },
});
