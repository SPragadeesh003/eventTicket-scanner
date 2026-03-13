import React, { useEffect, useState } from 'react';
import { Redirect } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import { ROUTES } from "@/constants/routes";
import * as SplashScreen from 'expo-splash-screen';

export default function Index() {
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<any>(null);

    useEffect(() => {
        let isMounted = true;

        const checkSession = async () => {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (isMounted) {
                setSession(currentSession);
                setLoading(false);
                SplashScreen.hideAsync();
            }
        };

        checkSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
            if (isMounted) {
                setSession(currentSession);
                setLoading(false);
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    if (loading) {
        return null;
    }

    if (!session) {
        return <Redirect href={`/${ROUTES.LOGIN}`} />;
    }

    return <Redirect href={`/${ROUTES.HOME}`} />;
}