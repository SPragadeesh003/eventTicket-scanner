import React, { useEffect, useState } from 'react';
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from 'react-native';
import { supabase } from "@/src/lib/supabase";
import { ROUTES } from "@/constants/routes";

export default function Index() {
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<any>(null);

    useEffect(() => {
        // Initial session check
        supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
            setSession(currentSession);
            setLoading(false);
        });

        // Listen for auth changes (login/logout)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
            setSession(currentSession);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#141414' }}>
                <ActivityIndicator size="large" color="#00C896" />
            </View>
        );
    }

    if (!session) {
        return <Redirect href={`/${ROUTES.LOGIN}`} />;
    }

    return <Redirect href={`/${ROUTES.HOME}`} />;
}