import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application"; // 패키지 이름 확인용
import { ActivityAction, startActivityAsync } from "expo-intent-launcher"; // 🌟 설정창 이동 핵심
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function ManageScreen() {
  const router = useRouter();

  // --- [상태 관리] ---
  const [isFirstScreenEnabled, setIsFirstScreenEnabled] = useState(false); // 첫화면 사용

  useEffect(() => {
    loadSettings();
  }, []);

  // 저장된 설정 불러오기
  const loadSettings = async () => {
    try {
      const savedState = await AsyncStorage.getItem("IS_LOCK_ENABLED");
      if (savedState !== null) {
        setIsFirstScreenEnabled(JSON.parse(savedState));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 🌟 [핵심] "첫화면 사용" 스위치 토글 시 작동하는 트리거
  const toggleFirstScreen = async (value: boolean) => {
    setIsFirstScreenEnabled(value);
    await AsyncStorage.setItem("IS_LOCK_ENABLED", JSON.stringify(value));

    if (value === true) {
      // 켜는 순간 -> 권한 설정 페이지로 보냄
      if (Platform.OS === "android") {
        Alert.alert(
          "권한 필요",
          "잠금화면 기능을 사용하려면 '다른 앱 위에 표시' 권한을 허용해야 합니다.",
          [
            {
              text: "취소",
              onPress: () => setIsFirstScreenEnabled(false),
              style: "cancel",
            },
            {
              text: "설정하러 가기",
              onPress: async () => {
                // 🚀 여기가 진짜 트리거입니다 (안드로이드 설정창 열기)
                // 바로 우리 앱의 권한 설정 화면으로 이동시킵니다.
                const packageName = Application.applicationId;
                await startActivityAsync(
                  ActivityAction.MANAGE_OVERLAY_PERMISSION,
                  {
                    data: `package:${packageName}`,
                  }
                );
              },
            },
          ]
        );
      }
    }
  };

  // 시스템 잠금화면 설정 열기 (보너스 기능)
  const openSystemLockSettings = async () => {
    if (Platform.OS === "android") {
      // 보안 설정 화면으로 이동
      await startActivityAsync(ActivityAction.SECURITY_SETTINGS);
    } else {
      Linking.openSettings();
    }
  };

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>잠금 설정</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* 1. 첫화면 사용 (메인 기능) */}
        <View style={styles.settingItem}>
          <View>
            <Text style={styles.settingLabel}>첫화면 사용</Text>
            <Text style={styles.settingDesc}>
              잠금화면에 메모와 날씨를 표시합니다.
            </Text>
          </View>
          <Switch
            value={isFirstScreenEnabled}
            onValueChange={toggleFirstScreen}
            trackColor={{ false: "#767577", true: "#4a90e2" }}
            thumbColor={isFirstScreenEnabled ? "#fff" : "#f4f3f4"}
          />
        </View>

        <View style={styles.divider} />

        {/* 2. 시스템 잠금화면 끄기 (설정으로 이동) */}
        <TouchableOpacity
          style={styles.settingItem}
          onPress={openSystemLockSettings}
        >
          <View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.settingLabel}>시스템 잠금화면 끄기</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>NEW</Text>
              </View>
            </View>
            <Text style={[styles.settingDesc, { color: "#4a90e2" }]}>
              시스템 잠금화면 설정 바로가기
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* 3. 기타 예시 메뉴들 (기능 없음, UI만) */}
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>백(Back)키로 해제</Text>
          <Switch value={false} disabled />
        </View>

        <View style={styles.divider} />

        <View style={styles.settingItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>
              시스템 잠금화면 해제 후 첫화면 보기
            </Text>
            <Text style={styles.settingDesc}>
              비밀번호, 패턴, 지문 해제 후 첫화면이 보입니다.
            </Text>
          </View>
          <Switch value={false} disabled />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" }, // 어두운 배경
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    backgroundColor: "#1e1e1e",
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  backButton: { padding: 5 },
  content: { flex: 1 },

  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#1e1e1e",
  },
  settingLabel: { fontSize: 16, color: "#fff", marginBottom: 4 },
  settingDesc: { fontSize: 12, color: "#888" },

  divider: { height: 1, backgroundColor: "#333" },

  badge: {
    backgroundColor: "#ff6b6b",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  badgeText: { color: "white", fontSize: 10, fontWeight: "bold" },
});
