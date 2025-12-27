import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false, // 상단 헤더 숨김 (깔끔하게)
        tabBarStyle: {
          backgroundColor: "#222", // 탭바 배경색 어둡게
          borderTopColor: "#333",
        },
        tabBarActiveTintColor: "#ffd700", // 선택된 탭 색상 (금색)
        tabBarInactiveTintColor: "#888",
      }}
    >
      {/* 1. 홈 (잠금화면 스타일) */}
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="home-variant"
              size={28}
              color={color}
            />
          ),
        }}
      />

      {/* 2. 관리 (리스트) */}
      <Tabs.Screen
        name="manage"
        options={{
          title: "메모 관리",
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="playlist-edit"
              size={28}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
