import React from "react";
import { useRouter } from "expo-router";
import SetNewPasswordScreen from "@/src/screens/auth/SetNewPasswordScreen";
import { ROUTES } from "@/constants/routes";

export default function SetPassword() {
  const router = useRouter();

  const handlePasswordSet = () => {
    console.log("Password Set Success!");
    router.replace(`/${ROUTES.HOME}`);
  };

  return <SetNewPasswordScreen onPasswordSet={handlePasswordSet} />;
}
