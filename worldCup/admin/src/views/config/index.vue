<template>
  <div class="config-page">
    <h2>系统配置</h2>
    <el-card style="max-width:600px">
      <el-form :model="form" label-width="160px" v-loading="loading">
        <el-form-item label="单注最低金额 (¥)"><el-input-number v-model="form.minBet" :min="0" :precision="2" :step="10" style="width:200px" /></el-form-item>
        <el-form-item label="单注最高金额 (¥)"><el-input-number v-model="form.maxBet" :min="0" :precision="2" :step="100" style="width:200px" /></el-form-item>
        <el-form-item label="赛事展示天数">
          <el-input-number v-model="form.matchDays" :min="1" :max="10" :step="1" style="width:200px" />
          <span class="tip">移动端只显示从今天起的天数（默认 2 = 今天+明天），1~10</span>
        </el-form-item>
        <el-form-item label="代理佣金开关">
          <el-switch v-model="form.agentCommissionEnabled" active-value="true" inactive-value="false" />
        </el-form-item>
        <el-form-item label="新建代理默认比例 (%)">
          <el-input-number v-model="form.agentDefaultRate" :min="0" :max="100" :precision="2" :step="0.5" style="width:200px" />
        </el-form-item>
        <el-form-item label="佣金确认方式">
          <el-select v-model="form.agentCommissionConfirm" style="width:200px">
            <el-option label="管理员手动确认" value="manual" />
            <el-option label="自动确认" value="auto" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" @click="doSave" :loading="saving">保存配置</el-button></el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSystemConfig, updateSystemConfig } from '@/api'

const loading=ref(false),saving=ref(false)
const form=reactive({
  minBet:2.00,maxBet:100000.00,matchDays:2,
  agentCommissionEnabled:'true',agentDefaultRate:2.5,agentCommissionConfirm:'manual'
})

onMounted(async()=>{loading.value=true;try{const res=await getSystemConfig();const d=res.data;if(d.minBet)form.minBet=parseFloat(d.minBet);if(d.maxBet)form.maxBet=parseFloat(d.maxBet);if(d.matchDays)form.matchDays=parseInt(d.matchDays);if(d.agentCommissionEnabled)form.agentCommissionEnabled=d.agentCommissionEnabled;if(d.agentDefaultRate)form.agentDefaultRate=parseFloat(d.agentDefaultRate);if(d.agentCommissionConfirm)form.agentCommissionConfirm=d.agentCommissionConfirm}catch(e){console.error(e)}loading.value=false})

const doSave=async()=>{saving.value=true;try{await updateSystemConfig({...form});ElMessage.success('配置已保存')}catch(e){ElMessage.error(e.message||'保存失败')};saving.value=false}
</script>

<style lang="scss" scoped>
.config-page h2 { margin-bottom: 16px; }
.tip { margin-left: 12px; color: #909399; font-size: 12px; }
</style>
