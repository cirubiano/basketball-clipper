"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { User, KeyRound, CheckCircle2 } from "lucide-react";
import { changePassword } from "@basketball-clipper/shared/api";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

// ── helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, token } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordMutation = useMutation({
    mutationFn: () => changePassword(token!, currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFormError(null);
      setSuccess(true);
      // Ocultar el mensaje de éxito tras 4 segundos
      setTimeout(() => setSuccess(false), 4000);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  function handleChangePassword() {
    setFormError(null);
    setSuccess(false);

    if (!currentPassword) {
      setFormError("Introduce tu contraseña actual");
      return;
    }
    if (newPassword.length < 8) {
      setFormError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("Las contraseñas no coinciden");
      return;
    }

    passwordMutation.mutate();
  }

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">Mi perfil</h1>

        {/* Información de la cuenta */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-muted-foreground" />
              Información de la cuenta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Correo electrónico</span>
              <span className="text-sm font-medium">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Tipo de cuenta</span>
              <Badge variant={user?.is_admin ? "default" : "secondary"}>
                {user?.is_admin ? "Administrador" : "Usuario"}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Miembro desde</span>
              <span className="text-sm font-medium">
                {user?.created_at ? formatDate(user.created_at) : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Cambiar contraseña */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
              Cambiar contraseña
            </CardTitle>
            <CardDescription>
              Usa una contraseña segura que no uses en otros sitios.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Contraseña actual</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setFormError(null);
                  setSuccess(false);
                }}
                autoComplete="current-password"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setFormError(null);
                  setSuccess(false);
                }}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirmar nueva contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setFormError(null);
                  setSuccess(false);
                }}
                autoComplete="new-password"
              />
            </div>

            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-200 bg-green-50 text-green-800">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>Contraseña actualizada correctamente.</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleChangePassword}
              disabled={passwordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
              className="w-full sm:w-auto"
            >
              {passwordMutation.isPending ? "Guardando..." : "Actualizar contraseña"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
