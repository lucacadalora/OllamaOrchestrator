import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Server } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isRegister, setIsRegister] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const endpoint = isRegister ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const res = await apiRequest("POST", endpoint, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: isRegister ? "Account created" : "Login successful",
        description: `Welcome to DGON Console`,
      });
      setLocation("/");
    },
    onError: (error: any) => {
      toast({
        title: isRegister ? "Registration failed" : "Login failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Server className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            {isRegister ? "Create Account" : "Welcome Back"}
          </CardTitle>
          <CardDescription>
            {isRegister 
              ? "Register to start managing GPU nodes" 
              : "Sign in to your DGON Console account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter your username" 
                        data-testid="input-username"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Enter your password"
                        data-testid="input-password"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loginMutation.isPending}
                data-testid="button-submit"
              >
                {loginMutation.isPending 
                  ? "Please wait..." 
                  : isRegister ? "Create Account" : "Sign In"}
              </Button>
            </form>
          </Form>
          <div className="mt-4 text-center text-sm">
            <button
              onClick={() => setIsRegister(!isRegister)}
              className="text-primary hover:underline"
              data-testid="button-toggle-mode"
            >
              {isRegister 
                ? "Already have an account? Sign in" 
                : "Don't have an account? Register"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
