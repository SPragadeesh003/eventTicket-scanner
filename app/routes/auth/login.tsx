import React from "react";
import { useRouter } from "expo-router";
import LoginScreen from "@/src/screens/auth/LoginScreen";
import { ROUTES } from "@/constants/routes";

export default function Login() {
  const router = useRouter();

  const handleLoginSuccess = (isFirstLogin: boolean) => {
    console.log("Login Success! First login:", isFirstLogin);
    if (isFirstLogin) {
      router.replace(`/${ROUTES.SET_PASSWORD}`);
    } else {
      router.replace(`/${ROUTES.HOME}`); 
    }
  };

  return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
}